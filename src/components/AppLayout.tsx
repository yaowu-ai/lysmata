import { Outlet } from 'react-router-dom';
import { LeftNav } from './LeftNav';
import { useGlobalStream } from '../shared/hooks/useGlobalStream';

export function AppLayout() {
  useGlobalStream();

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F7F8]">
      <LeftNav />
      <div className="flex flex-1 overflow-hidden min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
