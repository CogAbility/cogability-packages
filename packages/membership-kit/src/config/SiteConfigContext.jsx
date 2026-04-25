import { createContext, useContext } from 'react';

const SiteConfigContext = createContext(null);

export function SiteConfigProvider({ config, children }) {
  return (
    <SiteConfigContext.Provider value={config}>
      {children}
    </SiteConfigContext.Provider>
  );
}

export function useSiteConfig() {
  const config = useContext(SiteConfigContext);
  if (!config) throw new Error('useSiteConfig must be used inside <SiteConfigProvider>');
  return config;
}
