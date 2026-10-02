# 3. Put it on the Surfaces

Pick one way. Both give the same app; the difference is who does the clicking.

| | Option 1: IT pushes it | Option 2: each person installs it |
|---|---|---|
| Crew effort | **None.** It shows up in the Start menu. | Open a link, tap **Install** (about 2 minutes) |
| Needs | Surfaces managed by Intune or Group Policy | Microsoft Edge and Wi-Fi once |
| Can the crew remove it by accident? | No | Yes (they can reinstall the same way) |
| Email to send | [`emails/ask-it-to-push-the-app.md`](emails/ask-it-to-push-the-app.md) | [`emails/tell-the-crew.md`](emails/tell-the-crew.md) |

In both cases, test on **one** Surface first.

---

## Option 1: IT pushes it (zero-touch)

Microsoft Edge has a built-in policy, **"Configure list of force-installed Web Apps"**
(`WebAppInstallForceList`), that installs a web app on every managed device silently. Send your IT
team the ready-made email in [`emails/ask-it-to-push-the-app.md`](emails/ask-it-to-push-the-app.md).
It contains this setting, with your address filled in:

```json
[{"url": "https://<your-github-name>.github.io/FieldMeasure/", "default_launch_container": "window", "create_desktop_shortcut": true, "custom_name": "Field Measure"}]
```

Microsoft's reference page:
https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/webappinstallforcelist

After IT pushes it, each person still answers two first-run questions (below) the first time they
open the app.

## Option 2: each person installs it

On each Surface, with Wi-Fi:

1. Open **Microsoft Edge** and go to the app address. Send it as a link or QR code; nobody should
   have to type it.
2. Tap the **Install** icon at the right end of the address bar (it looks like a small square with
   a plus sign), then tap **Install**. If there's no icon: **…** menu → **More tools** → **Apps** →
   **Install Field Measure**.
3. The app opens in its own window with no address bar. From now on, open it from the **Start
   menu** or taskbar, not from a browser tab.

## First run (everyone, once)

1. **Which hand do you write with?** This puts the tool rail on the side your hand doesn't cover.
2. **Where should your projects live?** Tap **Use Documents\FieldMeasure**. When Windows or Edge
   asks for permission, choose **Allow on every visit** if offered. Otherwise the app asks again
   after each restart (a one-tap **Re-authorize** button on Home).

## Check offline works (do this on the test Surface)

1. Turn on **airplane mode**.
2. Close the app, then open it again from the Start menu.
3. It opens, and you can take a photo and add a dimension. Turn airplane mode off again.

If it doesn't open offline, open it once more with Wi-Fi on, wait 30 seconds, and try again.

## Getting the work off the Surface

Each project is a normal folder in `Documents\FieldMeasure`. Exports go in the folder chosen in the
export screen. To share, drag the folder into Dropbox or OneDrive, or attach the PDF to an email.
If the projects folder is inside a synced Dropbox or OneDrive folder, it backs up automatically.

## Already using the app at the old address?

If people installed it from `llevaachingada.github.io` (the original builder's address), move them
to yours:

1. Install from **your** address (above).
2. On first run, pick **the same folder** they used before. All their projects reappear; nothing
   was stored inside the old app.
3. Uninstall the old one: Start menu → right-click the old **Field Measure** → **Uninstall**.

The crew email has a version of these steps you can send.

## Updates

When you change the app (see [4. Changing it with AI](4-changing-it-with-ai.md)), each Surface shows
**"Update ready — reload when you're done"** the next time it's online and opened. Tapping **Reload**
updates it. Nobody reinstalls anything.
