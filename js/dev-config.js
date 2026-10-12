/* Café Mood — developer settings.

   The developer back office (Profile → ผู้พัฒนา) opens ONLY with a passcode set here. The app cannot create one by itself.
   Pick ONE of these, save, and upload this file (js/dev-config.js) to GitHub:

   1) Easiest — write the passcode:           passcode: 'your passcode'
      ⚠ Everything in a GitHub repository is public: anyone can read this file. Use a passcode you use nowhere else.

   2) Better — write a scrambled version:     salt: '...', hash: '...'
      Open tools/dev-key.html in your browser, type your passcode, copy the two lines it prints into here,
      and leave passcode empty. The passcode itself never appears in the repository. */
window.CM = window.CM || {};
CM.devConfig = { passcode: '', salt: '4a11ec0aa0cec5828c4e995869280600', hash: '7e63d0e8bae3d664948d346bf3d60fc2a29b3d4a4fbdac006e9b6248cf40f858' };

/* LINE (optional). Leave empty to use the demo flow. liffId comes from LINE Developers → your LIFF app (Endpoint URL = this site);
   oaId is your Official Account basic ID, e.g. '@cafemood'. */
CM.lineConfig = { liffId: '', oaId: '' };
