/**
 * Slice 1.7's image-inset handlers (asset decode, the picker callbacks, Focus, the constrained
 * replace), moved verbatim out of `SheetEditor` (beta-readiness plan R6). Rebuilt every render
 * exactly as the closures were; their free variables arrive through `InsetActionDeps`.
 */
import { type ChangeEvent } from 'react';
import type { ProjectFile } from '@/domain/schema';
import type { Annotation } from '@/domain/types';
import { LONG_PRESS_MS } from '@/editor/EditorCanvas';
import { styleCoalesceKey } from '@/editor/editorController';
export { styleCoalesceKey };
import { MarkupScene } from '@/editor/shapes/scene';
import { useEditorStore } from '@/state/editorStore';
import { InsetTool, replacePhotoDecision, type InsetAssetInput } from '@/editor/tools/InsetTool';
import { storeInsetAsset } from '@/editor/inset/insetAssets';
import { InsetAssetRegistry } from '@/ui/insetWiring';

import type { Dispatch, SetStateAction } from 'react';

type Ref<T> = { current: T };

export interface InsetActionDeps {
  projectId: string;
  sceneRef: Ref<MarkupScene | null>;
  insetRef: Ref<InsetTool | null>;
  insetAssetsRef: Ref<InsetAssetRegistry>;
  projectDirRef: Ref<{ dir: FileSystemDirectoryHandle; file: ProjectFile } | null>;
  replaceHoldTimerRef: Ref<number | null>;
  replacePrompt: { key: string; asset: InsetAssetInput } | null;
  setReplacePrompt: Dispatch<SetStateAction<{ key: string; asset: InsetAssetInput } | null>>;
  setReplaceHolding: Dispatch<SetStateAction<boolean>>;
  setInsetRecents: Dispatch<SetStateAction<Array<{ assetId: string; thumbUrl: string; name: string }>>>;
}

export function createInsetActions(deps: InsetActionDeps) {
  const {
    projectId, sceneRef, insetRef, insetAssetsRef, projectDirRef, replaceHoldTimerRef, replacePrompt,
    setReplacePrompt, setReplaceHolding, setInsetRecents,
  } = deps;

  const syncRecents = (): void => {
    setInsetRecents(insetAssetsRef.current.recentsList());
  };

  /**
   * Decode + cache one stored asset (`assets/<sha256hex>.jpg`). Off the main thread via
   * the shipped decode worker; a miss is swallowed (the placeholder stays).
   */
  async function ensureInsetAsset(assetId: string, name?: string): Promise<void> {
    const state = projectDirRef.current;
    if (!state || insetAssetsRef.current.has(assetId)) return;
    const entry = await insetAssetsRef.current.load(state.dir, assetId, name);
    if (entry) sceneRef.current?.refreshInsets();
    syncRecents();
  }

  /** §8.5: a restored `markup.json` may already contain insets — decode their assets. */
  async function hydrateInsetAssets(objects: readonly Annotation[]): Promise<void> {
    const state = projectDirRef.current;
    if (!state) return;
    const ids = new Set<string>();
    for (const object of objects) {
      if (object.type === 'image' && object.assetId) ids.add(object.assetId);
    }
    for (const id of ids) await ensureInsetAsset(id);
  }

  /** Store + decode every picked file, then insert them as one cascaded batch. */
  async function placePickedFiles(files: File[]): Promise<void> {
    const state = projectDirRef.current;
    if (!state) return;
    const assets: InsetAssetInput[] = [];
    for (const file of files) {
      let stored: { assetId: string; width: number; height: number };
      try {
        stored = await storeInsetAsset(state.dir, projectId, file);
      } catch {
        continue;
      }
      // Decode the STORED bytes (normalized JPEG), not the picked file (may be HEIC).
      await ensureInsetAsset(stored.assetId, file.name);
      assets.push({ assetId: stored.assetId, width: stored.width, height: stored.height });
    }
    syncRecents();
    if (assets.length > 0) insetRef.current?.placeFromAssets(assets);
  }

  const handleInsetDeviceChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';
    void placePickedFiles(files);
  };

  const handleInsetCameraChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file) void placePickedFiles([file]);
  };

  const pickRecent = (assetId: string): void => {
    void (async () => {
      let size = insetAssetsRef.current.sizeOf(assetId);
      if (!size) {
        await ensureInsetAsset(assetId);
        size = insetAssetsRef.current.sizeOf(assetId);
      }
      if (!size) return;
      insetRef.current?.placeFromAssets([{ assetId, width: size.width, height: size.height }]);
    })();
  };

  const enterFocusInset = (key: string): void => {
    // Inside Focus the user draws with any markup tool; the Inset tool is unavailable.
    useEditorStore.getState().setActiveTool('select');
    insetRef.current?.enterFocus(key);
  };

  /** Exits Focus WITHOUT touching the selection (UI §9:633 / the 1.7 gate). */
  const exitFocusInset = (): void => {
    insetRef.current?.exitFocus();
    useEditorStore.getState().setFocusInsetId(null);
  };

  const cancelReplacePrompt = (): void => {
    cancelReplaceHold();
    setReplacePrompt(null);
  };

  const applyReplace = (choice: 'keep' | 'remove'): void => {
    const prompt = replacePrompt;
    if (!prompt) return;
    insetRef.current?.replacePhoto(prompt.key, prompt.asset, choice);
    setReplacePrompt(null);
  };

  const startReplaceHold = (): void => {
    if (replaceHoldTimerRef.current !== null) return;
    setReplaceHolding(true);
    replaceHoldTimerRef.current = window.setTimeout(() => {
      replaceHoldTimerRef.current = null;
      setReplaceHolding(false);
      applyReplace('remove');
    }, LONG_PRESS_MS);
  };

  function cancelReplaceHold(): void {
    if (replaceHoldTimerRef.current !== null) {
      window.clearTimeout(replaceHoldTimerRef.current);
      replaceHoldTimerRef.current = null;
    }
    setReplaceHolding(false);
  }

  const handleReplaceChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file) void beginReplace(file);
  };

  /** Replace-photo: identical dimensions swap silently; a different size warns. */
  async function beginReplace(file: File): Promise<void> {
    const state = projectDirRef.current;
    const scene = sceneRef.current;
    const key = useEditorStore.getState().selection[0];
    if (!state || !scene || !key) return;
    const ann = scene.get(key);
    if (!ann || ann.type !== 'image') return;
    let stored: { assetId: string; width: number; height: number };
    try {
      stored = await storeInsetAsset(state.dir, projectId, file);
    } catch {
      return;
    }
    await ensureInsetAsset(stored.assetId, file.name);
    syncRecents();
    const newAsset: InsetAssetInput = {
      assetId: stored.assetId,
      width: stored.width,
      height: stored.height,
    };
    const oldAsset = insetAssetsRef.current.sizeOf(ann.assetId ?? '') ?? { width: 0, height: 0 };
    if (replacePhotoDecision(oldAsset, newAsset) === 'swap') {
      insetRef.current?.replacePhoto(key, newAsset, 'keep');
    } else {
      setReplacePrompt({ key, asset: newAsset });
    }
  }

  // The warned Replace-photo dialog is a real modal (§19.6): focus in on open, back on
  // close, Escape cancels (never a keyboard trap). Mirrors the keypad-sheet pattern.

  return { syncRecents, ensureInsetAsset, hydrateInsetAssets, placePickedFiles, handleInsetDeviceChange, handleInsetCameraChange, pickRecent, enterFocusInset, exitFocusInset, cancelReplacePrompt, applyReplace, startReplaceHold, cancelReplaceHold, handleReplaceChange, beginReplace };
}
