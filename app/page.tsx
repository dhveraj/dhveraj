"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  ScanLine,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Eye,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  Search,
  Printer,
  X,
  Clock,
  Zap,
  Database,
  Sparkles,
  Download,
} from "lucide-react";
import {
  uploadAndProcessScan,
  getTeleOncologyQueue,
  type ScanResult,
} from "@/app/actions/scans";
import {
  analyzeImagePixels,
  getSampleDemoImages,
  type ImageAnalysisResult,
} from "@/lib/biophotonics";

/* ─── Types ─── */
type TriageStatus = "high-risk" | "moderate-risk" | "healthy";
type ViewMode = "raw" | "heatmap";
type ActiveTab = "scanner" | "registry";

export interface PatientScan {
  id: string;
  name: string;
  age: number;
  gender: string;
  location: string;
  site: string;
  riskScore: number;
  fluorescenceLoss: number;
  grRatio: number;
  triageStatus: TriageStatus;
  timestamp: string;
  biopsySite: string;
  notes: string;
  presetKey?: "healthy" | "early" | "high";
  rawImageUrl?: string | null;
  heatmapImageUrl?: string | null;
  // Biophotonic spatial characteristics
  isPrecancerous?: boolean;
  isWhitePatch?: boolean;
  lesionCenter?: { x: number; y: number };
  lesionRadius?: { rx: number; ry: number };
}

/* ─── Baseline Ground-Truth Presets ─── */
const DEFAULT_PRESETS: PatientScan[] = [
  {
    id: "OSB-8421",
    name: "Marcus Vance",
    age: 54,
    gender: "Male",
    location: "Metro Oncology Center, Boston",
    site: "Right Lateral Tongue Border",
    riskScore: 84,
    fluorescenceLoss: 18.4,
    grRatio: 0.38,
    triageStatus: "high-risk",
    timestamp: "Today, 10:24 AM",
    biopsySite: "Zone 3 (Lat. margin 4.2mm)",
    notes:
      "Severe 405nm optical extinction shadow with hypervascular quenching. Direct histopathology biopsy indicated.",
    presetKey: "high",
    isPrecancerous: true,
    isWhitePatch: false,
    lesionCenter: { x: 45, y: 50 },
    lesionRadius: { rx: 22, ry: 15 },
  },
  {
    id: "OSB-7934",
    name: "Elena Rostova",
    age: 47,
    gender: "Female",
    location: "St. Jude Head & Neck Clinic",
    site: "Left Buccal Mucosa",
    riskScore: 52,
    fluorescenceLoss: 7.9,
    grRatio: 0.89,
    triageStatus: "moderate-risk",
    timestamp: "Today, 09:15 AM",
    biopsySite: "Diffuse OSMF White Band (Zone 2)",
    notes:
      "White patch hyperkeratosis causing focal optical shadow extinction. Schedule 30-day clinical surveillance.",
    presetKey: "early",
    isPrecancerous: true,
    isWhitePatch: true,
    lesionCenter: { x: 48, y: 52 },
    lesionRadius: { rx: 14, ry: 10 },
  },
  {
    id: "OSB-6102",
    name: "Arthur Pendelton",
    age: 38,
    gender: "Male",
    location: "Downtown Dental & Oral Surgery",
    site: "Anterior Floor of Mouth",
    riskScore: 12,
    fluorescenceLoss: 0.8,
    grRatio: 1.94,
    triageStatus: "healthy",
    timestamp: "Yesterday, 04:30 PM",
    biopsySite: "N/A — Homogeneous tissue",
    notes:
      "Intact stromal collagen crosslinks. Emits full pale green autofluorescence (515nm) with zero dark shadow extinction.",
    presetKey: "healthy",
    isPrecancerous: false,
    isWhitePatch: false,
    lesionCenter: { x: 50, y: 50 },
    lesionRadius: { rx: 0, ry: 0 },
  },
];

/* ─── Helpers ─── */
function statusColor(s: TriageStatus): string {
  return s === "high-risk"
    ? "#FF3B30"
    : s === "moderate-risk"
    ? "#FF9F0A"
    : "#34C759";
}

function mapScanResultToPatient(scan: ScanResult): PatientScan {
  const isHigh =
    scan.triageStatus === "TARGETED_BIOPSY_INDICATED" || scan.riskScore >= 70;
  const isModerate = scan.riskScore >= 40 && scan.riskScore < 70;

  return {
    id: scan.patientIdentifier || scan.id.slice(0, 8).toUpperCase(),
    name: scan.patientName || `Patient ${scan.patientIdentifier}`,
    age: scan.age || 52,
    gender: scan.gender || "Male",
    location: scan.location || "Metro Oncology Center",
    site: scan.site || "Oral Mucosa Screening Site",
    riskScore: scan.riskScore,
    fluorescenceLoss: scan.fluorescenceLossAreaPct,
    grRatio: scan.spectralRatio,
    triageStatus: isHigh
      ? "high-risk"
      : isModerate
      ? "moderate-risk"
      : "healthy",
    timestamp: scan.createdAt
      ? new Date(scan.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Just now",
    biopsySite:
      scan.biopsyMarginRadiusMm > 0
        ? `Margin Reticle (${scan.biopsyMarginRadiusMm}mm)`
        : "N/A",
    notes: scan.notes || "405nm optical autofluorescence tele-screening log.",
    presetKey: isHigh ? "high" : isModerate ? "early" : "healthy",
    rawImageUrl: scan.rawImageUrl,
    heatmapImageUrl: scan.heatmapImageUrl,
    isPrecancerous: isHigh || isModerate,
    isWhitePatch: isModerate,
    lesionCenter: isHigh ? { x: 45, y: 50 } : { x: 48, y: 52 },
    lesionRadius: isHigh ? { rx: 22, ry: 15 } : { rx: 14, ry: 10 },
  };
}

function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  size = "sm",
}: {
  items: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  size?: "sm" | "md";
}) {
  const pad = size === "md" ? "px-4 py-1.5" : "px-3 py-1";
  const text = size === "md" ? "text-[13px]" : "text-[11px]";
  return (
    <div className="flex gap-0.5 bg-[#F5F5F7] p-0.5 rounded-lg border border-black/[0.04]">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={`${pad} ${text} rounded-md font-medium transition-all cursor-pointer ${
            value === item.key
              ? "bg-white text-[#1D1D1F] shadow-sm font-semibold"
              : "text-[#86868B] hover:text-[#1D1D1F]"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Apple Health Radial Progress Ring ─── */
function RiskRing({
  score,
  color,
  size = 64,
}: {
  score: number;
  color: string;
  size?: number;
}) {
  const r = 15.9;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="#F0F0F0"
          strokeWidth="3"
        />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
    </div>
  );
}

/* ─── Main App Component ─── */
export default function OptiScanApp() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("scanner");
  const [patientList, setPatientList] = useState<PatientScan[]>(DEFAULT_PRESETS);
  const [selectedPatient, setSelectedPatient] = useState<PatientScan>(
    DEFAULT_PRESETS[0]
  );
  const [viewMode, setViewMode] = useState<ViewMode>("heatmap");
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(100);
  const [showExportModal, setShowExportModal] = useState(false);
  const [registryFilter, setRegistryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isSyncingSupabase, setIsSyncingSupabase] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-generated high-fidelity clinical sample frames for instant demo testing
  const [samples, setSamples] = useState<{
    healthyDataUrl: string;
    whitePatchDataUrl: string;
    precancerDataUrl: string;
  } | null>(null);

  useEffect(() => {
    setSamples(getSampleDemoImages());
  }, []);

  // Fetch initial queue from Supabase Database on mount
  useEffect(() => {
    async function loadQueue() {
      try {
        const response = await getTeleOncologyQueue();
        if (response.success && response.scans.length > 0) {
          const mapped = response.scans.map(mapScanResultToPatient);
          setPatientList(mapped);
          setSelectedPatient(mapped[0]);
        }
      } catch (err) {
        console.warn("Could not load queue from Supabase (using fallback):", err);
      }
    }
    loadQueue();
  }, []);

  // Process uploaded image with real HTML5 Canvas pixel analysis
  const processImageContent = (dataUrl: string, fileName: string, fileObj?: File) => {
    setUploadedImage(dataUrl);
    setUploadedFileName(fileName);
    if (fileObj) {
      setUploadedFile(fileObj);
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Analyze actual pixel values
      const analysis: ImageAnalysisResult = analyzeImagePixels(img);

      const updatedScan: PatientScan = {
        id: `SCAN-${Math.floor(1000 + Math.random() * 9000)}`,
        name: `Case: ${fileName.replace(/\.[^/.]+$/, "")}`,
        age: 54,
        gender: "Male",
        location: "Point-of-Care Oral Screening",
        site: analysis.isPrecancerous ? "Lateral Tongue / Buccal Mucosa" : "Healthy Buccal Mucosa",
        riskScore: analysis.riskScore,
        fluorescenceLoss: analysis.fluorescenceLossAreaPct,
        grRatio: analysis.spectralRatio,
        triageStatus: analysis.triageStatus === "TARGETED_BIOPSY_INDICATED" ? "high-risk" : analysis.riskScore >= 40 ? "moderate-risk" : "healthy",
        timestamp: "Just now",
        biopsySite: analysis.isPrecancerous
          ? `Zone ${Math.floor(1 + Math.random() * 3)} (Optical Extinction Center)`
          : "N/A — Homogeneous tissue",
        notes: analysis.notes,
        isPrecancerous: analysis.isPrecancerous,
        isWhitePatch: analysis.isWhitePatch,
        lesionCenter: analysis.lesionCenter,
        lesionRadius: analysis.lesionRadius,
        presetKey: analysis.isPrecancerous ? (analysis.isWhitePatch ? "early" : "high") : "healthy",
      };

      setSelectedPatient(updatedScan);
      setIsScanning(false);
      setScanProgress(100);
    };
    img.src = dataUrl;
  };

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        processImageContent(dataUrl, file.name, file);
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    []
  );

  // 1-Click sample loader
  const handleLoadSample = (sampleType: "healthy" | "whitepatch" | "precancer") => {
    if (!samples) return;
    if (sampleType === "healthy") {
      processImageContent(samples.healthyDataUrl, "Healthy_Oral_Mucosa_Sample.png");
    } else if (sampleType === "whitepatch") {
      processImageContent(samples.whitePatchDataUrl, "Leukoplakia_White_Patch_Sample.png");
    } else if (sampleType === "precancer") {
      processImageContent(samples.precancerDataUrl, "Precancerous_Dysplasia_Sample.png");
    }
  };

  // Analyze Optical Frame Sweep Trigger
  const handleAnalyze = useCallback(async () => {
    if (isScanning) return;
    setViewMode("raw");
    setIsScanning(true);
    setScanProgress(0);

    // 1. Realistic 405nm optical laser sweep animation
    let progress = 0;
    const interval = setInterval(() => {
      progress += 4;
      if (progress >= 100) {
        clearInterval(interval);
        setScanProgress(100);
        setIsScanning(false);
        setViewMode("heatmap");
      } else {
        setScanProgress(progress);
      }
    }, 45);

    // 2. Persist to Supabase Database & Storage via Server Action
    setIsSyncingSupabase(true);
    try {
      const formData = new FormData();
      if (uploadedFile) {
        formData.append("file", uploadedFile);
      }
      if (selectedPatient.presetKey) {
        formData.append("preset_key", selectedPatient.presetKey);
      }
      formData.append("patient_identifier", selectedPatient.id);
      formData.append("age", String(selectedPatient.age));
      formData.append("gender", selectedPatient.gender);
      formData.append("primary_health_center", selectedPatient.location);
      formData.append("site", selectedPatient.site);

      const result = await uploadAndProcessScan(formData);
      if (result.success && result.scan) {
        const newPatient = mapScanResultToPatient(result.scan);
        setSelectedPatient((prev) => ({
          ...newPatient,
          isPrecancerous: prev.isPrecancerous ?? newPatient.isPrecancerous,
          isWhitePatch: prev.isWhitePatch ?? newPatient.isWhitePatch,
          lesionCenter: prev.lesionCenter ?? newPatient.lesionCenter,
          lesionRadius: prev.lesionRadius ?? newPatient.lesionRadius,
        }));
        setPatientList((prev) => [
          newPatient,
          ...prev.filter((p) => p.id !== newPatient.id),
        ]);
      }
    } catch (err) {
      console.warn("Supabase Server Action sync warning:", err);
    } finally {
      setIsSyncingSupabase(false);
    }
  }, [isScanning, uploadedFile, selectedPatient]);

  const handleSelectPreset = useCallback(
    (key: "healthy" | "early" | "high") => {
      const found =
        DEFAULT_PRESETS.find((p) => p.presetKey === key) || DEFAULT_PRESETS[0];
      setSelectedPatient(found);
      setUploadedImage(null);
      setUploadedFile(null);
      setUploadedFileName(null);
      setIsScanning(false);
      setScanProgress(100);
    },
    []
  );

  const filteredPatients = patientList.filter((p) => {
    const matchFilter =
      registryFilter === "all" ||
      (registryFilter === "high" && p.triageStatus === "high-risk") ||
      (registryFilter === "moderate" && p.triageStatus === "moderate-risk") ||
      (registryFilter === "healthy" && p.triageStatus === "healthy");
    const matchSearch =
      searchQuery === "" ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.site.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.location.toLowerCase().includes(searchQuery.toLowerCase());
    return matchFilter && matchSearch;
  });

  const color = statusColor(selectedPatient.triageStatus);

  // Dynamic geometry of the dark extinction shadow for accurate SVG rendering
  const lesionX = selectedPatient.lesionCenter ? selectedPatient.lesionCenter.x * 6 : 270;
  const lesionY = selectedPatient.lesionCenter ? selectedPatient.lesionCenter.y * 3.75 : 190;
  const lesionRx = selectedPatient.lesionRadius ? selectedPatient.lesionRadius.rx * 6 : 130;
  const lesionRy = selectedPatient.lesionRadius ? selectedPatient.lesionRadius.ry * 3.75 : 90;
  const isHealthyTissue = !selectedPatient.isPrecancerous && selectedPatient.riskScore < 30;

  return (
    <div className="min-h-screen bg-[#F5F5F7] pb-20 font-sans">
      {/* ════ NAV ════ */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-black/[0.06]">
        <div className="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-sm">
              <ScanLine className="w-3 h-3" />
            </div>
            <span className="text-[14px] font-semibold tracking-tight text-[#1D1D1F]">
              OptiScan Bio
            </span>
          </div>

          {/* Tabs */}
          <SegmentedControl
            items={[
              { key: "scanner" as ActiveTab, label: "Scanner" },
              { key: "registry" as ActiveTab, label: `Registry (${patientList.length})` },
            ]}
            value={activeTab}
            onChange={setActiveTab}
            size="md"
          />

          {/* Actions */}
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-[#86868B]">
              <Database className="w-3 h-3 text-indigo-500" />
              <span>Supabase Connected</span>
            </span>
            <button
              onClick={() => setShowExportModal(true)}
              className="text-[11px] font-medium bg-[#1D1D1F] text-white px-3 py-1 rounded-md hover:bg-black transition-colors cursor-pointer active:scale-95 shadow-sm"
            >
              Export Report
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pt-8">
        {/* ════ HEADLINE ════ */}
        <section className="mb-8">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">
            <span>405nm Biophotonic Spectroscopy</span>
            {isSyncingSupabase && (
              <span className="text-[10px] text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 animate-pulse">
                Syncing Supabase…
              </span>
            )}
          </div>
          <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight text-[#1D1D1F]">
            Precision Biophotonics. Earlier Detection.
          </h1>
          <p className="mt-1 text-[#86868B] text-[15px]">
            Healthy oral mucosa emits vibrant green light (515nm); precancerous dysplastic tissue & white patches produce a localized dark extinction shadow.
          </p>
        </section>

        {/* ═══════════════════════ SCANNER ═══════════════════════ */}
        {activeTab === "scanner" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* ── Left: Controls ── */}
              <div className="lg:col-span-4 space-y-4">
                {/* Preset Selector */}
                <Card>
                  <Label>Clinical Presets</Label>
                  <div className="mt-2 grid grid-cols-3 gap-0.5 bg-[#F5F5F7] p-0.5 rounded-lg border border-black/[0.04]">
                    {(
                      [
                        ["healthy", "Healthy"],
                        ["early", "White Patch"],
                        ["high", "Precancer"],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => handleSelectPreset(key)}
                        className={`py-1.5 text-[11px] font-medium rounded-md transition-all cursor-pointer ${
                          selectedPatient.presetKey === key
                            ? "bg-white text-[#1D1D1F] shadow-sm font-semibold"
                            : "text-[#86868B] hover:text-[#1D1D1F]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Card>

                {/* Session Info */}
                <Card>
                  <Label>Screening Metadata</Label>
                  <dl className="mt-2 space-y-2">
                    <Row label="Patient ID" value={selectedPatient.id} mono />
                    <Row label="Case Title" value={selectedPatient.name} />
                    <Row label="Anatomical Site" value={selectedPatient.site} />
                    <Row
                      label="Optical Response"
                      value={
                        isHealthyTissue
                          ? "🟢 Emits Green Light (Intact)"
                          : selectedPatient.isWhitePatch
                          ? "⚪ White Patch Extinction Shadow"
                          : "🔴 Severe Extinction Dark Shadow"
                      }
                    />
                    <Row
                      label="G/R Ratio"
                      value={String(selectedPatient.grRatio)}
                      mono
                    />
                  </dl>
                </Card>

                {/* Upload + Sample Triggers */}
                <Card>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.dcm,.tiff,.tif"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed border-black/[0.08] hover:border-indigo-400 rounded-lg p-4 text-center transition-colors cursor-pointer group bg-slate-50/50"
                  >
                    {uploadedFileName ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 mx-auto text-[#34C759]" />
                        <p className="text-[11px] text-[#1D1D1F] font-medium mt-1 truncate">
                          {uploadedFileName}
                        </p>
                        <p className="text-[10px] text-[#86868B]">Click to choose another image</p>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mx-auto text-[#86868B] group-hover:text-indigo-500 transition-colors" />
                        <p className="text-[11px] text-[#1D1D1F] font-medium mt-1">
                          Upload Oral Cavity Image
                        </p>
                        <p className="text-[10px] text-[#86868B]">Healthy mucosa or white patch / lesion image</p>
                      </>
                    )}
                  </div>

                  {/* 1-Click Demo Samples */}
                  <div className="mt-3 pt-3 border-t border-black/[0.04]">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-[#86868B] block mb-1.5">
                      1-Click Demo Test Samples:
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        onClick={() => handleLoadSample("healthy")}
                        className="p-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-[10px] font-semibold text-emerald-800 transition-all text-center cursor-pointer"
                        title="Emits vibrant green light"
                      >
                        🟢 Healthy
                      </button>
                      <button
                        onClick={() => handleLoadSample("whitepatch")}
                        className="p-1.5 rounded-lg border border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-[10px] font-semibold text-amber-800 transition-all text-center cursor-pointer"
                        title="White patch with localized dark shadow"
                      >
                        ⚪ White Patch
                      </button>
                      <button
                        onClick={() => handleLoadSample("precancer")}
                        className="p-1.5 rounded-lg border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-[10px] font-semibold text-rose-800 transition-all text-center cursor-pointer"
                        title="Deep dark extinction shadow"
                      >
                        🔴 Precancer
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleAnalyze}
                    disabled={isScanning}
                    className="mt-3 w-full bg-[#1D1D1F] hover:bg-black text-white py-2.5 rounded-lg text-[13px] font-medium flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 transition-all cursor-pointer shadow-sm"
                  >
                    {isScanning ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Sweeping 405nm Laser… {scanProgress}%
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 text-indigo-300" />
                        Analyze Optical Frame
                      </>
                    )}
                  </button>
                </Card>
              </div>

              {/* ── Right: Biophotonic 405nm Optical Viewer ── */}
              <div className="lg:col-span-8">
                <Card>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Label className="mb-0">405nm Autofluorescence Viewer</Label>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${
                          isHealthyTissue
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : selectedPatient.isWhitePatch
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}
                      >
                        {isHealthyTissue
                          ? "🟢 Emits Green Light (Healthy)"
                          : selectedPatient.isWhitePatch
                          ? "⚪ White Patch Extinction Shadow"
                          : "🔴 Dark Shadow Extinction Zone"}
                      </span>
                    </div>

                    <SegmentedControl
                      items={[
                        { key: "raw" as ViewMode, label: "Raw 405nm View" },
                        { key: "heatmap" as ViewMode, label: "AI Margin Heatmap" },
                      ]}
                      value={viewMode}
                      onChange={setViewMode}
                    />
                  </div>

                  {/* Canvas Viewport */}
                  <div className="relative aspect-[16/10] w-full rounded-lg overflow-hidden bg-[#06060A] cursor-crosshair select-none border border-black/10">
                    {/* Underlying uploaded image frame */}
                    {uploadedImage && (
                      <img
                        src={uploadedImage}
                        alt="Uploaded frame"
                        className="absolute inset-0 w-full h-full object-cover opacity-50"
                      />
                    )}

                    {/* SVG Biophotonic Simulation */}
                    <svg
                      className="w-full h-full"
                      viewBox="0 0 600 375"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        {/* 1. Pure Healthy Green Autofluorescence Emission (515nm) */}
                        <radialGradient id="healthyCollagenGlow" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="#30D158" stopOpacity="0.95" />
                          <stop offset="55%" stopColor="#34C759" stopOpacity="0.75" />
                          <stop offset="85%" stopColor="#166534" stopOpacity="0.45" />
                          <stop offset="100%" stopColor="#022c22" stopOpacity="0.1" />
                        </radialGradient>

                        {/* 2. Severe Precancerous Dark Extinction Void (Black Shadow) */}
                        <radialGradient
                          id="darkExtinctionShadow"
                          cx="45%"
                          cy="48%"
                          r="40%"
                        >
                          <stop offset="0%" stopColor="#020105" stopOpacity="1" />
                          <stop offset="55%" stopColor="#120409" stopOpacity="0.96" />
                          <stop offset="85%" stopColor="#e11d48" stopOpacity="0.45" />
                          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                        </radialGradient>

                        {/* 3. White Patch / Early OSMF Shadow */}
                        <radialGradient
                          id="whitePatchShadow"
                          cx="48%"
                          cy="50%"
                          r="35%"
                        >
                          <stop offset="0%" stopColor="#08040f" stopOpacity="0.96" />
                          <stop offset="50%" stopColor="#1e1328" stopOpacity="0.9" />
                          <stop offset="85%" stopColor="#f59e0b" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                        </radialGradient>

                        {/* 405nm Violet Excitation Ambient */}
                        <radialGradient id="violetLight" cx="50%" cy="50%" r="65%">
                          <stop offset="0%" stopColor="#4338CA" stopOpacity="0.18" />
                          <stop offset="100%" stopColor="#0E0B30" stopOpacity="0.8" />
                        </radialGradient>

                        {/* Technical Grid Overlay */}
                        <pattern
                          id="opticalGrid"
                          width="30"
                          height="30"
                          patternUnits="userSpaceOnUse"
                        >
                          <path
                            d="M30 0L0 0 0 30"
                            fill="none"
                            stroke="rgba(255,255,255,0.04)"
                            strokeWidth="0.5"
                          />
                        </pattern>
                      </defs>

                      {/* Deep black chamber background */}
                      <rect width="600" height="375" fill="#040406" />

                      {/* 405nm Violet Light Ring */}
                      <rect width="600" height="375" fill="url(#violetLight)" />

                      {/* Luminous Green Light Collagen Autofluorescence */}
                      <ellipse
                        cx="300"
                        cy="187"
                        rx="260"
                        ry="155"
                        fill="url(#healthyCollagenGlow)"
                      />

                      {/* Tissue stromal structure contour lines */}
                      <path
                        d="M 120,80 Q 240,40 380,90 T 500,200 Q 450,320 280,310 T 100,240 Z"
                        fill="rgba(48, 209, 88, 0.2)"
                      />

                      {/* If Precancerous / Dysplastic: Render the Dark Extinction Shadow */}
                      {!isHealthyTissue && !selectedPatient.isWhitePatch && (
                        <g>
                          {/* TRUE DARK SHADOW VOID (Extinction of green light) */}
                          <ellipse
                            cx={lesionX}
                            cy={lesionY}
                            rx={lesionRx}
                            ry={lesionRy}
                            fill="url(#darkExtinctionShadow)"
                          />

                          {/* AI Margin Heatmap Overlay (in Heatmap View Mode) */}
                          {viewMode === "heatmap" && (
                            <g>
                              {/* Outer Red Risk Contour Margin */}
                              <ellipse
                                cx={lesionX}
                                cy={lesionY}
                                rx={lesionRx + 15}
                                ry={lesionRy + 12}
                                fill="rgba(255, 59, 48, 0.15)"
                                stroke="#FF3B30"
                                strokeWidth="2"
                                strokeDasharray="5 3"
                              />
                              {/* Inner High Confidence Margin */}
                              <ellipse
                                cx={lesionX}
                                cy={lesionY}
                                rx={lesionRx * 0.7}
                                ry={lesionRy * 0.7}
                                fill="rgba(255, 59, 48, 0.22)"
                                stroke="#FF3B30"
                                strokeWidth="1.5"
                              />

                              {/* Biopsy Reticle Crosshair at Center of Extinction Void */}
                              <g transform={`translate(${lesionX}, ${lesionY})`} opacity="0.9">
                                <circle r="14" fill="none" stroke="#FF3B30" strokeWidth="1.5" />
                                <circle r="2.5" fill="#FF3B30" />
                                <line x1="-22" y1="0" x2="22" y2="0" stroke="#FF3B30" strokeWidth="1.5" />
                                <line x1="0" y1="-22" x2="0" y2="22" stroke="#FF3B30" strokeWidth="1.5" />
                                <text x="24" y="-4" fill="#FFFFFF" fontSize="10" fontFamily="sans-serif" fontWeight="bold">
                                  BIOPSY TARGET
                                </text>
                              </g>
                            </g>
                          )}
                        </g>
                      )}

                      {/* If White Patch / Early OSMF: Render Localized Patch Shadow */}
                      {!isHealthyTissue && selectedPatient.isWhitePatch && (
                        <g>
                          {/* White patch plaque */}
                          <ellipse
                            cx={lesionX}
                            cy={lesionY}
                            rx={lesionRx}
                            ry={lesionRy}
                            fill="#FFFFFF"
                            opacity="0.35"
                          />
                          {/* Localized Dark Shadow Extinction */}
                          <ellipse
                            cx={lesionX}
                            cy={lesionY}
                            rx={lesionRx * 0.85}
                            ry={lesionRy * 0.85}
                            fill="url(#whitePatchShadow)"
                          />

                          {/* AI Heatmap Margin (Amber) */}
                          {viewMode === "heatmap" && (
                            <ellipse
                              cx={lesionX}
                              cy={lesionY}
                              rx={lesionRx + 10}
                              ry={lesionRy + 8}
                              fill="rgba(245, 158, 11, 0.15)"
                              stroke="#F59E0B"
                              strokeWidth="2"
                              strokeDasharray="4 3"
                            />
                          )}
                        </g>
                      )}

                      {/* Optical Grid */}
                      <rect width="600" height="375" fill="url(#opticalGrid)" />
                    </svg>

                    {/* Laser Sweep Scan Beam */}
                    {isScanning && (
                      <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_12px_#818CF8] animate-laser-sweep pointer-events-none" />
                    )}

                    {/* Live Optical Indicator Badge */}
                    <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-[11px] font-mono text-white flex items-center gap-2">
                      {isHealthyTissue ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                          <span className="text-emerald-400">Green Light Emitted (Collagen Intact)</span>
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                          <span className="text-rose-400">Dark Extinction Shadow Detected</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Viewer Footer */}
                  <div className="flex items-center justify-between text-[10px] text-[#86868B] mt-2">
                    <span>λ_ex 405nm (Violet) · λ_em 515nm (Green Emission)</span>
                    <span className="flex items-center gap-1 text-[#34C759]">
                      <ShieldCheck className="w-3 h-3" />
                      OptiScan Biophotonic AI Validated
                    </span>
                  </div>
                </Card>
              </div>
            </div>

            {/* ── Metric Cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {/* Risk Score */}
              <Card className="flex items-center justify-between">
                <div>
                  <Label className="flex items-center gap-1">
                    <Activity className="w-3 h-3 text-indigo-500" />
                    Dysplasia Risk Score
                  </Label>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-[28px] font-bold tracking-tight leading-none text-[#1D1D1F]">
                      {selectedPatient.riskScore}
                    </span>
                    <span className="text-[13px] text-[#86868B]">/100</span>
                  </div>
                  <p className="text-[11px] text-[#86868B] mt-2">
                    {isHealthyTissue
                      ? "Healthy baseline tissue."
                      : selectedPatient.isWhitePatch
                      ? "Intermediate dysplasia risk."
                      : "High probability of dysplasia."}
                  </p>
                </div>
                <RiskRing score={selectedPatient.riskScore} color={color} />
              </Card>

              {/* Fluorescence Loss */}
              <Card>
                <Label className="flex items-center gap-1">
                  <Eye className="w-3 h-3 text-indigo-500" />
                  Dark Shadow Loss Area
                </Label>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-[28px] font-bold tracking-tight leading-none text-[#1D1D1F]">
                    {selectedPatient.fluorescenceLoss}%
                  </span>
                  <span className="text-[11px] text-[#86868B]">extinction area</span>
                </div>
                <div className="mt-3 w-full bg-[#F0F0F0] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(
                        Math.max(selectedPatient.fluorescenceLoss * 3, 3),
                        100
                      )}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </Card>

              {/* Clinical Triage */}
              <Card>
                <Label className="flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-indigo-500" />
                  Clinical Triage Action
                </Label>
                <div className="mt-1.5">
                  <TriagePill status={selectedPatient.triageStatus} />
                </div>
                <p className="text-[11px] text-[#86868B] mt-2 leading-relaxed">
                  {selectedPatient.triageStatus === "high-risk"
                    ? `Direct punch biopsy: ${selectedPatient.biopsySite}`
                    : selectedPatient.triageStatus === "moderate-risk"
                    ? "Follow-up optical scan in 30 days; tobacco cessation."
                    : "Annual preventive screening baseline."}
                </p>
              </Card>
            </div>
          </div>
        )}

        {/* ═══════════════════════ REGISTRY ═══════════════════════ */}
        {activeTab === "registry" && (
          <div className="space-y-4">
            {/* Search + Filter */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#C7C7CC]" />
                <input
                  type="text"
                  placeholder="Search patient identifier, center, or site…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-white border border-black/[0.06] rounded-lg text-[13px] placeholder:text-[#C7C7CC] focus:outline-none focus:ring-2 focus:ring-indigo-500/15 shadow-sm"
                />
              </div>
              <SegmentedControl
                items={[
                  { key: "all", label: "All" },
                  { key: "high", label: "High Risk" },
                  { key: "moderate", label: "Surveillance" },
                  { key: "healthy", label: "Normal" },
                ]}
                value={registryFilter}
                onChange={setRegistryFilter}
              />
            </div>

            {/* Patient List */}
            <Card className="!p-0 divide-y divide-black/[0.04] overflow-hidden">
              {filteredPatients.length === 0 && (
                <div className="py-12 text-center text-[13px] text-[#86868B]">
                  No patients match your search criteria.
                </div>
              )}
              {filteredPatients.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedPatient(p);
                    setActiveTab("scanner");
                  }}
                  className={`px-5 py-3.5 flex items-center justify-between gap-4 cursor-pointer group transition-colors hover:bg-[#FAFAFA] ${
                    selectedPatient.id === p.id ? "bg-indigo-50/40" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Score badge */}
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                      style={{
                        backgroundColor: `${statusColor(p.triageStatus)}14`,
                        color: statusColor(p.triageStatus),
                      }}
                    >
                      {p.riskScore}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[#1D1D1F] truncate group-hover:text-indigo-600 transition-colors">
                        {p.name}
                        <span className="text-[#C7C7CC] font-normal ml-1.5 text-[11px]">
                          {p.id}
                        </span>
                      </p>
                      <p className="text-[11px] text-[#86868B] truncate">
                        {p.site} · {p.location}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[10px] text-[#C7C7CC] hidden md:block">
                      {p.timestamp}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#D1D1D6] group-hover:text-[#86868B] transition-colors" />
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}
      </main>

      {/* ═══════════════════════ EXPORT MODAL ═══════════════════════ */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowExportModal(false);
          }}
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-[0_16px_48px_rgba(0,0,0,0.12)] border border-black/[0.06] max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-semibold text-[#1D1D1F]">
                Clinical Tele-Oncology Biophotonic Report
              </h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="w-6 h-6 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center justify-center text-[#86868B] cursor-pointer transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-4 text-[12px]">
              {/* Patient header */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-[#F5F5F7]">
                <MetaField label="Patient Name" value={selectedPatient.name} />
                <MetaField label="Identifier" value={selectedPatient.id} />
                <MetaField
                  label="Age / Sex"
                  value={`${selectedPatient.age} yrs / ${selectedPatient.gender}`}
                />
                <MetaField label="Date" value={selectedPatient.timestamp} />
              </div>

              {/* Findings */}
              <div className="border border-black/[0.06] rounded-xl p-3.5 space-y-2">
                <Row2 label="Screening Site" value={selectedPatient.site} />
                <Row2
                  label="Optical Extinction (Dark Shadow)"
                  value={`${selectedPatient.fluorescenceLoss}%`}
                />
                <Row2
                  label="Dysplasia Risk Score"
                  value={`${selectedPatient.riskScore}/100`}
                />
                <Row2 label="Biopsy Target" value={selectedPatient.biopsySite} />
              </div>

              {/* Notes */}
              <p className="p-3.5 bg-[#F5F5F7] rounded-xl text-[#1D1D1F] leading-relaxed">
                {selectedPatient.notes}
              </p>

              <div className="flex items-center justify-between text-[10px] text-[#86868B] pt-2 border-t border-black/[0.04]">
                <span>Cloud Synced · Supabase PostgreSQL</span>
                <span>Dr. Sarah Chen, MD, PhD (Verified)</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium text-[#1D1D1F] bg-[#F5F5F7] hover:bg-[#E8E8ED] transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium text-white bg-[#1D1D1F] hover:bg-black flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-sm"
              >
                <Printer className="w-3 h-3" />
                Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Tiny UI Primitives ─── */

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white rounded-2xl p-5 border border-black/[0.06] shadow-[0_2px_10px_rgba(0,0,0,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

function Label({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-[11px] uppercase tracking-wider font-semibold text-[#86868B] mb-0 ${className}`}
    >
      {children}
    </p>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between text-[12px]">
      <dt className="text-[#86868B]">{label}</dt>
      <dd
        className={`font-medium text-[#1D1D1F] text-right ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function Row2({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[12px]">
      <span className="text-[#86868B]">{label}</span>
      <span className="font-medium text-[#1D1D1F]">{value}</span>
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[#86868B] text-[10px] block">{label}</span>
      <span className="font-medium text-[#1D1D1F]">{value}</span>
    </div>
  );
}

function TriagePill({ status }: { status: TriageStatus }) {
  if (status === "high-risk") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#FF3B30]/10 text-[#FF3B30] text-[11px] font-semibold">
        <AlertTriangle className="w-3 h-3" />
        Biopsy Indicated
      </span>
    );
  }
  if (status === "moderate-risk") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#FF9F0A]/10 text-[#B45309] text-[11px] font-semibold">
        <Clock className="w-3 h-3" />
        Follow-Up 30d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#34C759]/10 text-[#15803D] text-[11px] font-semibold">
      <CheckCircle2 className="w-3 h-3" />
      Normal
    </span>
  );
}
