import React from 'react';
import { createHashRouter, Navigate } from 'react-router';
import { Fulllayout } from '../layouts/fulllayout.jsx';
import Dashboard from '../views/dashboard/dashboard.jsx';
import LogView from '../views/log/log.jsx';
import FirmwareView from '../views/firmware/firmware.jsx';
import FirmwareHistory from '../views/firmware/history.jsx';

export const createAppRouter = ({ onLogout }) =>
  createHashRouter([
    {
      path: '/',
      element: <Fulllayout onLogout={onLogout} />,
      children: [
        { index: true, element: <Navigate to="/dash" replace /> },
        { path: 'dash', element: <Dashboard /> },
        { path: 'log', element: <LogView /> },
        { path: 'firmware', element: <FirmwareView /> },
        { path: 'firmware/history', element: <FirmwareHistory /> },
      ],
    },
  ]);