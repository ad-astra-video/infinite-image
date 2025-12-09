import { injected } from 'wagmi/connectors';

export const metaMaskDeeplinkWallet = {
  id: 'metamask-deeplink',
  name: 'MetaMask',
  iconUrl: 'https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/metamask-fox.svg',
  iconBackground: '#fff',
  createConnector: () => {
    const connector = injected();
    return {
      connector,
      mobile: {
        getUri: () => {
          return `https://metamask.app.link/dapp/${window.location.host}`;
        },
      },
    };
  },
};