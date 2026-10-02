# Email: ask your IT team to push the app to every Surface

Replace `<your-github-name>`, the names and the date, then send. The JSON line must stay on one
line exactly as written, with only the address changed.

---

**Subject:** Request: push the "Field Measure" web app to our Surfaces (Edge policy, about 15 min)

Hi <IT contact>,

We're rolling out **Field Measure**, a small offline app our crews use on their Surfaces to put
dimensions on site photos. It's a web app (a PWA) that installs through Microsoft Edge, so there's no
installer, no server, no sign-in and no data leaving the device. Everything saves to a folder on the
Surface.

Could you push it to <which Surfaces / which group> with the Edge policy **"Configure list of
force-installed Web Apps"** (`WebAppInstallForceList`)?

- **Intune:** Devices → Configuration → Create → Windows 10 and later → Settings catalog → Microsoft
  Edge → *Configure list of force-installed Web Apps*
- **Group Policy:** Administrative Templates → Microsoft Edge → *Configure list of force-installed
  Web Apps*
- **Registry:** `HKLM\SOFTWARE\Policies\Microsoft\Edge`, value `WebAppInstallForceList` (REG_SZ)

Value:

```json
[{"url": "https://<your-github-name>.github.io/FieldMeasure/", "default_launch_container": "window", "create_desktop_shortcut": true, "custom_name": "Field Measure"}]
```

Microsoft reference:
https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/webappinstallforcelist

What the app needs, in case anything is locked down:

- **Microsoft Edge** (Chrome also works) with the File System Access API allowed. It's on by
  default; the app saves to `Documents\FieldMeasure` or a folder the user picks.
- **Camera** permission for that site.
- Access to `*.github.io` **once**, for the install and for occasional updates. After that it runs
  fully offline.
- It does **not** need admin rights, a service account, a server, or any inbound or outbound
  connection to a backend.

Could you try it on one Surface first (<name>'s would be ideal) and let me know when it's ready?
Then we'll roll it out to the rest.

Thanks,
<your name>
