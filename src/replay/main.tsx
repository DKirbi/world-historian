import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import pack from '../../data/replay/rome.json';
import type { ReplayPack } from './types';
import '../styles/global.scss';
import './replay.scss';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App pack={pack as unknown as ReplayPack} />
  </StrictMode>,
);
