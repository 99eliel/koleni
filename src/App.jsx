import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import ApprovalShareToast from './components/ApprovalShareToast';
import MeasurementGuideDock from './components/MeasurementGuideDock';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import StaffAuth from './components/StaffAuth';
import AdminPage from './pages/AdminPage';
import ApprovalPage from './pages/ApprovalPage';
import ArchivedGarmentsPage from './pages/ArchivedGarmentsPage';
import CustomizerPage from './pages/CustomizerPage';
import OrderRevisionPage from './pages/OrderRevisionPage';
import ProductionPipelinePage from './pages/ProductionPipelinePage';
import PublicLandingPage from './pages/PublicLandingPage';
import SellerOrdersPage from './pages/SellerOrdersPage';
import TechnicalSheetPage from './pages/TechnicalSheetPage';
import TeamManagementPage from './pages/TeamManagementPage';
import './catalog-trash.css';
import './operations.css';

function SeoController() {
  const location = useLocation();

  useEffect(() => {
    const isPublicLanding = location.pathname === '/';
    const robots = document.querySelector('meta[name="robots"]');
    const googlebot = document.querySelector('meta[name="googlebot"]');
    const description = document.querySelector('meta[name="description"]');

    if (isPublicLanding) {
      document.title = 'Koleni Gestão da Personalização | Uniformes e Logos';
      robots?.setAttribute('content', 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');
      googlebot?.setAttribute('content', 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');
      description?.setAttribute('content', 'Koleni Gestão da Personalização: plataforma para personalização de uniformes, aplicação e gestão de logos, cores, layouts, pedidos e remoção de fundo com inteligência artificial.');
    } else {
      document.title = 'Koleni Vendas | Sistema Interno';
      robots?.setAttribute('content', 'noindex,nofollow,noarchive');
      googlebot?.setAttribute('content', 'noindex,nofollow,noarchive');
      description?.setAttribute('content', 'Área interna da plataforma Koleni.');
    }
  }, [location.pathname]);

  return null;
}

function SellerRoute({ pwaEntry = false }) {
  const { garmentId } = useParams();
  return (
    <StaffAuth>
      {({ user, isAdmin, logout, profile, role }) => (
        role === 'production'
          ? <Navigate to="/admin/producao" replace />
          : (
            <>
              <CustomizerPage staffUser={user} staffProfile={profile} isAdmin={isAdmin} logout={logout} />
              <Link className="seller-orders-shortcut" to="/meus-pedidos">Meus pedidos</Link>
              {garmentId && <MeasurementGuideDock garmentId={garmentId} />}
              {pwaEntry && <PwaInstallPrompt />}
            </>
          )
      )}
    </StaffAuth>
  );
}

function SellerOrdersRoute() {
  return (
    <StaffAuth>
      {({ user, isAdmin, logout, profile, role }) => (
        role === 'production'
          ? <Navigate to="/admin/producao" replace />
          : <SellerOrdersPage user={user} profile={profile} isAdmin={isAdmin} logout={logout} />
      )}
    </StaffAuth>
  );
}

function RevisionRoute() {
  return (
    <StaffAuth allowedRoles={['seller', 'admin']}>
      {({ user, isAdmin, logout }) => (
        <OrderRevisionPage user={user} isAdmin={isAdmin} logout={logout} />
      )}
    </StaffAuth>
  );
}

function TechnicalSheetRoute() {
  return (
    <StaffAuth allowedRoles={['seller', 'admin']}>
      {({ isAdmin, logout }) => (
        <TechnicalSheetPage isAdmin={isAdmin} logout={logout} />
      )}
    </StaffAuth>
  );
}

function AdminRoute() {
  return (
    <>
      <AdminPage />
      <Link className="admin-production-shortcut" to="/admin/producao">Produção</Link>
      <Link className="admin-team-shortcut" to="/admin/equipe">Equipe</Link>
      <Link className="admin-archive-shortcut" to="/admin/arquivadas">Peças arquivadas</Link>
    </>
  );
}

export default function App() {
  return (
    <>
      <SeoController />
      <Routes>
        <Route path="/aprovar/:orderId/:token" element={<ApprovalPage />} />
        <Route path="/" element={<PublicLandingPage />} />
        <Route path="/vendedor" element={<SellerRoute pwaEntry />} />
        <Route path="/customizar/:garmentId" element={<SellerRoute />} />
        <Route path="/meus-pedidos" element={<SellerOrdersRoute />} />
        <Route path="/revisar/:orderId" element={<RevisionRoute />} />
        <Route path="/ficha-tecnica/:orderId" element={<TechnicalSheetRoute />} />
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="/admin/producao" element={<ProductionPipelinePage />} />
        <Route path="/admin/equipe" element={<TeamManagementPage />} />
        <Route path="/admin/arquivadas" element={<ArchivedGarmentsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ApprovalShareToast />
    </>
  );
}
