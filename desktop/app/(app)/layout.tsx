import AuthGate from '@/app/components/AuthGate';
import Sidebar from '@/app/components/Sidebar';
import TopBar from '@/app/components/TopBar';
import tenant from '@/config/tenant';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <div className="shell">
        <Sidebar tenantName={tenant.name} />
        <div className="main">
          <TopBar tenantName={tenant.name} />
          <main className="page-content">{children}</main>
        </div>
      </div>
    </AuthGate>
  );
}
