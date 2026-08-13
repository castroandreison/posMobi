import LogView from '../views/log/log.jsx';
import Dashboard from '../views/dashboard/dashboard.jsx';

var ThemeRoutes = [
  {
    path: '/dash',
    name: 'Dashboard',
    icon: 'mdi mdi-view-dashboard',
    component: Dashboard
  },
  {
    path: '/log',
    name: 'Log',
    icon: 'mdi mdi-view-list',
    component: LogView
  },
  { path: '/', pathTo: '/dash', name: 'Dashboard', redirect: true }
];
export default ThemeRoutes;