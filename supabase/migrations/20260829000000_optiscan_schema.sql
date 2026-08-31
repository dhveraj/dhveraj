-- ==============================================================================
-- OptiScan Bio — Tele-Oncology 405nm Biophotonic Database Schema
-- ==============================================================================

-- Enable UUID extension if not already available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create Patients Table
CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  patient_identifier TEXT UNIQUE NOT NULL,
  age INTEGER NOT NULL CHECK (age >= 0 AND age <= 130),
  gender TEXT NOT NULL,
  tobacco_history_years INTEGER NOT NULL DEFAULT 0 CHECK (tobacco_history_years >= 0),
  primary_health_center TEXT NOT NULL
);

-- 2. Create Optical Scans Table
CREATE TABLE IF NOT EXISTS public.optical_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_image_url TEXT,
  heatmap_image_url TEXT,
  risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  fluorescence_loss_area_pct NUMERIC(5,2) NOT NULL CHECK (fluorescence_loss_area_pct >= 0 AND fluorescence_loss_area_pct <= 100),
  spectral_ratio NUMERIC(6,3) NOT NULL,
  triage_status TEXT NOT NULL CHECK (triage_status IN ('ROUTINE_FOLLOWUP', 'TARGETED_BIOPSY_INDICATED')),
  biopsy_margin_radius_mm NUMERIC(4,2) NOT NULL DEFAULT 0.00,
  reviewed_by_oncologist BOOLEAN NOT NULL DEFAULT FALSE
);

-- 3. Create Performance & Foreign Key Indexes
CREATE INDEX IF NOT EXISTS idx_optical_scans_patient_id ON public.optical_scans(patient_id);
CREATE INDEX IF NOT EXISTS idx_optical_scans_risk_score ON public.optical_scans(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_optical_scans_created_at ON public.optical_scans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_identifier ON public.patients(patient_identifier);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.optical_scans ENABLE ROW LEVEL SECURITY;

-- 5. Baseline RLS Policies for Patients
DROP POLICY IF EXISTS "Allow public and authenticated read access on patients" ON public.patients;
CREATE POLICY "Allow public and authenticated read access on patients"
  ON public.patients FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Allow public and authenticated insert on patients" ON public.patients;
CREATE POLICY "Allow public and authenticated insert on patients"
  ON public.patients FOR INSERT
  TO public
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update on patients" ON public.patients;
CREATE POLICY "Allow authenticated update on patients"
  ON public.patients FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 6. Baseline RLS Policies for Optical Scans
DROP POLICY IF EXISTS "Allow public and authenticated read access on optical_scans" ON public.optical_scans;
CREATE POLICY "Allow public and authenticated read access on optical_scans"
  ON public.optical_scans FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Allow public and authenticated insert on optical_scans" ON public.optical_scans;
CREATE POLICY "Allow public and authenticated insert on optical_scans"
  ON public.optical_scans FOR INSERT
  TO public
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update on optical_scans" ON public.optical_scans;
CREATE POLICY "Allow authenticated update on optical_scans"
  ON public.optical_scans FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 7. Supabase Storage Bucket Configuration
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinical-scans',
  'clinical-scans',
  false,
  52428800, -- 50MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/tiff', 'application/dicom']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800;

-- 8. Storage Object RLS Policies for clinical-scans
DROP POLICY IF EXISTS "Allow read access on clinical-scans objects" ON storage.objects;
CREATE POLICY "Allow read access on clinical-scans objects"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'clinical-scans');

DROP POLICY IF EXISTS "Allow insert on clinical-scans objects" ON storage.objects;
CREATE POLICY "Allow insert on clinical-scans objects"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'clinical-scans');

DROP POLICY IF EXISTS "Allow update on clinical-scans objects" ON storage.objects;
CREATE POLICY "Allow update on clinical-scans objects"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'clinical-scans')
  WITH CHECK (bucket_id = 'clinical-scans');
