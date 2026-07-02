import { useState } from "react";
import { FolderKanban, Plus, Trash2, UserPlus } from "lucide-react";
import { engine } from "../lib/engine";
import { useLive } from "../hooks/useLive";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Modal, Field, Input, Textarea, Select, Badge } from "../components/ui";
import type { Role } from "../types";

export default function Projects() {
  useLive([]);
  const { user, currentOrgId, can } = useAuth();
  const [tab, setTab] = useState<"projects" | "members">("projects");
  const [projectModal, setProjectModal] = useState(false);
  const [inviteModal, setInviteModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("DEVELOPER");

  const isAdmin = can(["ADMIN"]);
  if (!user || !currentOrgId) return null;

  const projects = engine.listProjects(currentOrgId);
  const members = engine.listMembers(currentOrgId);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await engine.createProject(currentOrgId!, name.trim(), description.trim());
    setName(""); setDescription(""); setProjectModal(false);
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    await engine.inviteMember(currentOrgId!, inviteEmail.trim(), inviteRole);
    setInviteEmail(""); setInviteRole("DEVELOPER"); setInviteModal(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Projects &amp; Team</h1>
          <p className="text-sm text-slate-500">Manage projects and role-based access for this organization.</p>
        </div>
        {tab === "projects" ? (
          <Button onClick={() => setProjectModal(true)} disabled={!can(["ADMIN", "DEVELOPER"])}><Plus size={15} /> New project</Button>
        ) : (
          <Button onClick={() => setInviteModal(true)} disabled={!isAdmin}><UserPlus size={15} /> Invite member</Button>
        )}
      </div>

      <div className="flex gap-1 border-b border-slate-800">
        {(["projects", "members"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-3 py-2 text-sm font-medium capitalize ${tab === t ? "border-indigo-500 text-indigo-300" : "border-transparent text-slate-500 hover:text-slate-300"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "projects" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300"><FolderKanban size={16} /></div>
              <h3 className="text-sm font-semibold text-slate-100">{p.name}</h3>
              <p className="mt-1 text-xs text-slate-500">{p.description || "No description"}</p>
              <p className="mt-3 text-xs text-slate-400">{p.queueCount} queue{p.queueCount === 1 ? "" : "s"}</p>
            </Card>
          ))}
          {projects.length === 0 && <p className="text-sm text-slate-500">No projects yet — create one to get started.</p>}
        </div>
      )}

      {tab === "members" && (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-slate-900">
                  <td className="px-4 py-2.5 text-slate-200">{m.user.name}</td>
                  <td className="px-4 py-2.5 text-slate-400">{m.user.email}</td>
                  <td className="px-4 py-2.5">
                    {isAdmin ? (
                      <Select
                        className="w-36"
                        value={m.role}
                        onChange={(e) => engine.updateMemberRole(m.id, e.target.value as Role)}
                      >
                        <option value="ADMIN">ADMIN</option>
                        <option value="DEVELOPER">DEVELOPER</option>
                        <option value="VIEWER">VIEWER</option>
                      </Select>
                    ) : (
                      <Badge tone="indigo">{m.role}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {isAdmin && m.userId !== user.id && (
                      <button onClick={() => engine.removeMember(m.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={projectModal} onClose={() => setProjectModal(false)} title="Create project">
        <form onSubmit={createProject}>
          <Field label="Project name">
            <Input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Growth Platform" />
          </Field>
          <Field label="Description">
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project for?" />
          </Field>
          <Button type="submit" className="w-full">Create project</Button>
        </form>
      </Modal>

      <Modal open={inviteModal} onClose={() => setInviteModal(false)} title="Invite member">
        <form onSubmit={invite}>
          <Field label="Email address">
            <Input type="email" autoFocus required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teammate@company.com" />
          </Field>
          <Field label="Role">
            <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
              <option value="ADMIN">ADMIN — full access</option>
              <option value="DEVELOPER">DEVELOPER — manage queues &amp; jobs</option>
              <option value="VIEWER">VIEWER — read only</option>
            </Select>
          </Field>
          <Button type="submit" className="w-full">Send invite</Button>
        </form>
      </Modal>
    </div>
  );
}
