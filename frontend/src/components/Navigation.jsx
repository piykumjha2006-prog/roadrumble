import React from 'react';
import { NavLink } from 'react-router-dom';
import { Camera, MapPin, Navigation2, FileText } from 'lucide-react';

export default function Navigation() {
  const navItems = [
    {
      to: '/',
      label: 'Detect',
      icon: Camera,
    },
    {
      to: '/navigate',
      label: 'Navigate',
      icon: Navigation2,
    },
    {
      to: '/map',
      label: 'Map',
      icon: MapPin,
    },
    {
      to: '/reports',
      label: 'Reports',
      icon: FileText,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0d1322]/95 backdrop-blur border-t border-slate-800 px-2 py-2 shadow-2xl">
      <div className="max-w-md mx-auto grid grid-cols-4 gap-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `touch-target flex flex-col items-center justify-center rounded-2xl py-2 px-3 transition-all duration-150 active:scale-95 ${
                isActive
                  ? 'bg-gradient-to-b from-amber-500/20 to-amber-600/10 border border-amber-500/50 text-amber-400 font-bold shadow-lg shadow-amber-500/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 font-medium'
              }`
            }
          >
            <Icon className="w-6 h-6 mb-1 stroke-[2.2]" />
            <span className="text-xs tracking-wide uppercase font-semibold">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
