/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN?: string;
  readonly VITE_MAPBOX_TOKEN?: string;
  readonly VITE_MAPBOX_USER?: string;
  readonly VITE_MAPBOX_STYLE_ID?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'satellite.js';
