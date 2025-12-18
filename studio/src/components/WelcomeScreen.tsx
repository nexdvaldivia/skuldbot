import { useEffect, useState } from "react";
import { open } from "@tauri-apps/api/dialog";
import { SkuldLogo } from "./ui/SkuldLogo";
import { Button } from "./ui/Button";
import { useProjectStore } from "../store/projectStore";
import { useNavigationStore } from "../store/navigationStore";
import { RecentProject } from "../types/project";
import {
  FolderPlus,
  FolderOpen,
  Clock,
  Trash2,
  ExternalLink,
  BookOpen,
  ChevronRight,
  Bot,
  Zap,
} from "lucide-react";

interface CreateProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function CreateProjectDialog({ isOpen, onClose }: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [path, setPath] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const { createProject } = useProjectStore();
  const { setView } = useNavigationStore();

  const handleSelectFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select folder for project",
    });

    if (selected && typeof selected === "string") {
      setPath(selected);
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !path) return;

    setIsCreating(true);
    try {
      const fullPath = `${path}/${name.toLowerCase().replace(/\s+/g, "-")}`;
      await createProject(fullPath, name, description || undefined);
      setView("project");
      onClose();
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">
          Create New Project
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Project Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Automation Project"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this project does..."
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Location
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={path}
                readOnly
                placeholder="Select a folder..."
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600"
              />
              <Button variant="outline" onClick={handleSelectFolder}>
                Browse
              </Button>
            </div>
          </div>

          {path && name && (
            <div className="text-sm text-slate-500">
              Project will be created at:{" "}
              <span className="font-mono text-slate-700">
                {path}/{name.toLowerCase().replace(/\s+/g, "-")}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || !path || isCreating}
          >
            {isCreating ? "Creating..." : "Create Project"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function WelcomeScreen() {
  const { recentProjects, loadRecentProjects, openProject, removeRecentProject } =
    useProjectStore();
  const { setView } = useNavigationStore();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    loadRecentProjects();
  }, [loadRecentProjects]);

  const handleOpenProject = async () => {
    const selected = await open({
      filters: [
        { name: "SkuldBot Project", extensions: ["skuld"] },
        { name: "All Files", extensions: ["*"] },
      ],
      multiple: false,
      title: "Open SkuldBot Project",
    });

    if (selected && typeof selected === "string") {
      await openProject(selected);
      setView("project");
    }
  };

  const handleOpenRecent = async (project: RecentProject) => {
    await openProject(project.path);
    setView("project");
  };

  const handleRemoveRecent = async (
    e: React.MouseEvent,
    project: RecentProject
  ) => {
    e.stopPropagation();
    await removeRecentProject(project.path);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-slate-50 to-slate-100 flex">
      {/* Left Panel - Branding */}
      <div className="w-[400px] bg-gradient-to-br from-primary-600 to-primary-700 p-8 flex flex-col">
        <div className="flex items-center gap-4 mb-8">
          <SkuldLogo size={48} className="text-white" />
          <div>
            <h1 className="text-2xl font-bold text-white leading-tight">SkuldBot<sup className="text-[10px] font-normal align-super ml-0.5">TM</sup></h1>
            <p className="text-primary-200 text-xs -mt-0.5">Automation Designer</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Intelligent
            <br />
            Automation
          </h2>
          <p className="text-primary-200 text-lg leading-relaxed">
            Build powerful RPA + AI automations with our intuitive visual editor.
            Combine robotic process automation with artificial intelligence.
          </p>
          <div className="flex gap-2 mt-4">
            <span className="px-2 py-1 bg-white/10 rounded text-xs text-primary-100">RPA</span>
            <span className="px-2 py-1 bg-white/10 rounded text-xs text-primary-100">AI</span>
            <span className="px-2 py-1 bg-white/10 rounded text-xs text-primary-100">No-Code</span>
            <span className="px-2 py-1 bg-white/10 rounded text-xs text-primary-100">Low-Code</span>
          </div>
        </div>

        <div className="space-y-3">
          <a
            href="#"
            className="flex items-center gap-3 text-primary-200 hover:text-white transition-colors"
          >
            <BookOpen className="w-5 h-5" />
            <span>Documentation</span>
            <ExternalLink className="w-4 h-4 ml-auto" />
          </a>
        </div>

        <div className="mt-8 pt-4 border-t border-primary-500/30">
          <p className="text-primary-300 text-sm">
            v0.1.0 - All Rights Reserved
          </p>
          <p className="text-primary-400 text-xs mt-1">
            Skuld, LLC - An Asgard Insight company
          </p>
        </div>
      </div>

      {/* Right Panel - Actions */}
      <div className="flex-1 p-8 overflow-auto flex items-center">
        <div className="max-w-2xl mx-auto w-full">
          {/* Quick Start - Highlighted */}
          <div className="mb-6">
            <button
              onClick={() => setView("quickstart")}
              className="w-full flex items-center gap-4 p-5 bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl shadow-lg hover:shadow-xl hover:from-primary-600 hover:to-primary-700 transition-all group text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-white text-lg">Quick Start</h4>
                <p className="text-primary-100 text-sm">
                  Jump straight into the editor - no project setup required
                </p>
              </div>
              <ChevronRight className="w-6 h-6 text-white/60 group-hover:text-white transition-colors" />
            </button>
          </div>

          {/* Project Actions */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">
              Projects
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setShowCreateDialog(true)}
                className="flex items-start gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:border-primary-300 hover:shadow-md transition-all group text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600 group-hover:bg-primary-500 group-hover:text-white transition-colors">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-medium text-slate-800">New Project</h4>
                  <p className="text-sm text-slate-500">
                    Create a multi-bot project
                  </p>
                </div>
              </button>

              <button
                onClick={handleOpenProject}
                className="flex items-start gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:border-primary-300 hover:shadow-md transition-all group text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                  <FolderOpen className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-medium text-slate-800">Open Project</h4>
                  <p className="text-sm text-slate-500">
                    Open an existing project
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Recent Projects */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-slate-400" />
              <h3 className="text-lg font-semibold text-slate-800">
                Recent Projects
              </h3>
            </div>

            {recentProjects.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <Bot className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-slate-600">No recent projects</p>
                <p className="text-sm text-slate-400 mt-1">
                  Create or open a project to get started
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentProjects.map((project) => (
                  <div
                    key={project.path}
                    onClick={() => handleOpenRecent(project)}
                    className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:border-primary-300 hover:shadow-md transition-all group text-left cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-primary-100 group-hover:text-primary-600 transition-colors">
                      <Bot className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-slate-800 truncate">
                        {project.name}
                      </h4>
                      <p className="text-sm text-slate-500 truncate">
                        {project.path}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">
                        {formatDate(project.lastOpened)}
                      </span>
                      <button
                        onClick={(e) => handleRemoveRecent(e, project)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                        title="Remove from recent"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary-500 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Project Dialog */}
      <CreateProjectDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />
    </div>
  );
}
