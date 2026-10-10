/* Café Mood — developer settings.

   The developer back office (Profile → ผู้พัฒนา) opens ONLY with a passcode set here. The app cannot create one by itself.
   Pick ONE of these, save, and upload this file (js/dev-config.js) to GitHub:

   1) Easiest — write the passcode:           passcode: 'your passcode'
      ⚠ Everything in a GitHub repository is public: anyone can read this file. Use a passcode you use nowhere else.

   2) Better — write a scrambled version:     salt: '...', hash: '...'
      Open tools/dev-key.html in your browser, type your passcode, copy the two lines it prints into here,
      and leave passcode empty. The passcode itself never appears in the repository. */
window.CM = window.CM || {};
CM.devConfig = { passcode: '', salt: 'b96499e522cee8eea96383915b15836b', hash: '5693e2aeb8bbeb7f4f75c00e2d6f2c5dc7c02b33553bc6912999d41853973933' };
