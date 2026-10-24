import { NavLink, Outlet } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { checkApiHealth, listInvestigations } from "../api/client";
import { Icon } from "./Icon";

export function AppShell() {
  const { data: apiOk } = useQuery({
    queryKey: ["healthz"],
    queryFn: checkApiHealth,
    refetchInterval: 30_000,
  });
  const { data } = useQuery({
    queryKey: ["investigations"],
    queryFn: listInvestigations,
    refetchInterval: 10_000,
  });
  const count = data?.investigations.length ?? 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="mark" />
          </span>
          <span>
            blackbox<span className="brand-for"> for agents</span>
          </span>
        </div>
        <div className="workspace-switch">
          <div className="workspace-avatar">A</div>
          <div>
            <strong>Accurith Workspace</strong>
            <small>Prototype</small>
          </div>
          <span className="chevron">⌄</span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Primary navigation">
          <NavLink
            to="/investigations"
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            <Icon name="investigation" /> Investigations
            {count > 0 && <span className="nav-count">{count}</span>}
          </NavLink>
          <button className="nav-item">
            <Icon name="rulebook" /> Rulebooks
          </button>
          <button className="nav-item">
            <Icon name="overview" /> Overview
          </button>
        </nav>
        <div className="side-spacer" />
        <div className="storage-card">
          <div className="storage-top">
            <span>Workspace usage</span>
            <span>LOCAL</span>
          </div>
          <div className="storage-bar">
            <i />
          </div>
          <small>
            {count} {count === 1 ? "investigation" : "investigations"} stored · SQLite
          </small>
        </div>
        <button className="nav-item settings">
          <Icon name="settings" /> Settings
        </button>
        <div className="profile">
          <div className="profile-avatar">AC</div>
          <div>
            <strong>Accurith</strong>
            <small>Administrator</small>
          </div>
          <Icon name="more" />
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <b>/</b>
            <strong>Investigations</strong>
          </div>
          <div className="top-actions">
            <span className={`api-status${apiOk === false ? " api-offline" : ""}`}>
              <i />
              {apiOk == null ? "Checking API" : apiOk ? "API ready" : "API offline"}
            </span>
            <button className="avatar-small">AC</button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
