import { useState } from "react";
import { Building2, Plus, Users } from "lucide-react";
import { engine } from "../lib/engine";
import { useLive } from "../hooks/useLive";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Modal, Field, Input, Badge } from "../components/ui";

export default function Organizations() {
  useLive([]);
  const { user, currentOrgId, setCurrentOrgId } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  if (!user) return null;

  const orgs = engine.listOrganizations(user.id);

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const org = await engine.createOrganization(user!.id, name.trim());
    await engine.createProject(org.id, "Default Project", "Automatically created for you");
    setCurrentOrgId(org.id);
    setName(""); setOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Organizations</h1>
          <p className="text-sm text-slate-500">Organizations group projects, queues and team members.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus size={15} /> New organization</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orgs.map((o) => (
          <Card key={o.id} className={`p-4 ${o.id === currentOrgId ? "ring-1 ring-indigo-500" : ""}`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-300"><Building2 size={16} /></div>
              <Badge tone="indigo">{o.role}</Badge>
            </div>
            <h3 className="text-sm font-semibold text-slate-100">{o.name}</h3>
            <p className="text-xs text-slate-500">{o.slug}</p>
            <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1"><Users size={12} /> {o.memberCount} members</span>
              <span>{o.projectCount} projects</span>
            </div>
            <Button size="sm" variant={o.id === currentOrgId ? "secondary" : "primary"} className="mt-4 w-full" onClick={() => setCurrentOrgId(o.id)}>
              {o.id === currentOrgId ? "Currently active" : "Switch to this org"}
            </Button>
          </Card>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Create organization">
        <form onSubmit={createOrg}>
          <Field label="Organization name">
            <Input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corp" />
          </Field>
          <Button type="submit" className="w-full">Create</Button>
        </form>
      </Modal>
    </div>
  );
}
