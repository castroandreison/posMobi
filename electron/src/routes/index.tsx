import React from 'react';
import { createHashRouter, Navigate } from 'react-router';
import { Fulllayout } from '../layouts/fulllayout';
import Dashboard from '../views/dashboard/dashboard';
import LogView from '../views/log/log';
import FirmwareView from '../views/firmware/firmware';
import FirmwareHistory from '../views/firmware/history';

interface RouterProps {
  onLogout: () => void;
}

export const createAppRouter = ({ onLogout }: RouterProps) =>
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
