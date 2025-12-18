import { useState } from "react";
import { useProjectStore } from "../store/projectStore";
import { Input } from "./ui/Input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Button } from "./ui/Button";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Settings, Globe, Eye, Save, Clock, FileText } from "lucide-react";

export default function SettingsPanel() {
  const { project } = useProjectStore();
  const [hasChanges, setHasChanges] = useState(false);

  const [formData, setFormData] = useState({
    name: project?.project.name || "",
    description: project?.project.description || "",
    defaultBrowser: project?.settings.defaultBrowser || "chromium",
    defaultHeadless: project?.settings.defaultHeadless ?? true,
    autoSaveEnabled: project?.settings.autoSave?.enabled ?? true,
    autoSaveInterval: project?.settings.autoSave?.intervalMs || 5000,
  });

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    // Here you would call updateProjectSettings
    setHasChanges(false);
  };

  return (
    <div className="flex-1 bg-slate-50 overflow-auto">
      <div className="max-w-3xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-800">
                Project Settings
              </h1>
              <p className="text-sm text-slate-500">
                Configure your project preferences
              </p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={!hasChanges}>
            <Save className="w-4 h-4" />
            Save Changes
          </Button>
        </div>

        <div className="space-y-4">
          {/* General Settings */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                <h2 className="font-medium text-slate-800">General</h2>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Basic project information and metadata
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium text-slate-700">
                  Project Name
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="My Automation Project"
                  className="h-10 border-slate-200 focus:border-primary-300 focus:ring-primary-100"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium text-slate-700">
                  Description
                </Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder="Describe what this project does..."
                  rows={3}
                  className="border-slate-200 focus:border-primary-300 focus:ring-primary-100 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Browser Settings */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-slate-400" />
                <h2 className="font-medium text-slate-800">Browser Defaults</h2>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Configure the default browser settings for your bots
              </p>
            </div>
            <div className="p-5 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="browser" className="text-sm font-medium text-slate-700">
                  Default Browser
                </Label>
                <Select
                  value={formData.defaultBrowser}
                  onValueChange={(value) => handleChange("defaultBrowser", value)}
                >
                  <SelectTrigger id="browser" className="h-10 border-slate-200">
                    <SelectValue placeholder="Select browser" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chromium">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        Chromium
                      </div>
                    </SelectItem>
                    <SelectItem value="firefox">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-orange-500" />
                        Firefox
                      </div>
                    </SelectItem>
                    <SelectItem value="webkit">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-purple-500" />
                        WebKit (Safari)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="h-px bg-slate-100" />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-slate-400" />
                    <Label htmlFor="headless" className="text-sm font-medium text-slate-700">
                      Headless Mode
                    </Label>
                  </div>
                  <p className="text-sm text-slate-500">
                    Run browsers without a visible window by default
                  </p>
                </div>
                <Switch
                  id="headless"
                  checked={formData.defaultHeadless}
                  onCheckedChange={(checked) =>
                    handleChange("defaultHeadless", checked)
                  }
                />
              </div>
            </div>
          </div>

          {/* Auto-Save Settings */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <h2 className="font-medium text-slate-800">Auto-Save</h2>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Automatically save your work at regular intervals
              </p>
            </div>
            <div className="p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="autosave" className="text-sm font-medium text-slate-700">
                    Enable Auto-Save
                  </Label>
                  <p className="text-sm text-slate-500">
                    Automatically save changes to your bots
                  </p>
                </div>
                <Switch
                  id="autosave"
                  checked={formData.autoSaveEnabled}
                  onCheckedChange={(checked) =>
                    handleChange("autoSaveEnabled", checked)
                  }
                />
              </div>

              {formData.autoSaveEnabled && (
                <>
                  <div className="h-px bg-slate-100" />
                  <div className="space-y-2">
                    <Label htmlFor="interval" className="text-sm font-medium text-slate-700">
                      Save Interval
                    </Label>
                    <div className="flex items-center gap-3">
                      <Input
                        id="interval"
                        type="number"
                        value={formData.autoSaveInterval / 1000}
                        onChange={(e) =>
                          handleChange(
                            "autoSaveInterval",
                            parseInt(e.target.value) * 1000
                          )
                        }
                        min={1}
                        className="w-24 h-10 border-slate-200 focus:border-primary-300 focus:ring-primary-100"
                      />
                      <span className="text-sm text-slate-500">
                        seconds
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Minimum recommended: 5 seconds
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
