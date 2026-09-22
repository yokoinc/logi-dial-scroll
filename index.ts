import { PluginSDK } from '@logitech/plugin-sdk';

import { OhifDialScrollAction, OhifRollerScrollAction } from './src/dial-actions';
import { shutdownInput, warmUpInput } from './src/win-input';

const pluginSDK = new PluginSDK();

console.log('[logi-dial-scroll] demarrage du plugin');
warmUpInput();

pluginSDK.registerAction(new OhifDialScrollAction());
pluginSDK.registerAction(new OhifRollerScrollAction());

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    shutdownInput();
    process.exit(0);
  });
}

await pluginSDK.connect();
