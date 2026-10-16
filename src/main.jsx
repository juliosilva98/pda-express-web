import React from 'react';
import { createRoot } from 'react-dom/client';
import * as PDFLib from 'pdf-lib';
import './legacy/sistema.css';
import Raiz from './plataforma/Raiz.jsx';

window.PDFLib = PDFLib;   // o gerador de PDF do sistema usa a biblioteca por este nome

// tema escolhido pela pessoa neste computador (☾), antes de desenhar a tela
try {
  const t = JSON.parse(localStorage.getItem('pda_v3:theme') || 'null');
  if (t) document.documentElement.setAttribute('data-theme', t);
} catch (e) {}

createRoot(document.getElementById('root')).render(<Raiz />);
