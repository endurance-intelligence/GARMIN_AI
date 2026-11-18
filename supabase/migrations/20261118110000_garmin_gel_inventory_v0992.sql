-- v0.9.92: verified manufacturer gel variants + personal inventory.
-- Stock and taste preferences are user-owned; catalog cannot be edited from a browser.
CREATE TABLE IF NOT EXISTS public.garmin_gel_catalog (
 id text PRIMARY KEY,
 brand text NOT NULL CHECK (brand IN ('Maurten','SiS','226ERS')),
 name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 130),
 flavor text NOT NULL DEFAULT 'Standard',
 carbs_g numeric(6,1) CHECK (carbs_g IS NULL OR carbs_g BETWEEN 0 AND 250),
 caffeine_mg integer CHECK (caffeine_mg IS NULL OR caffeine_mg BETWEEN 0 AND 500),
 sodium_mg integer CHECK (sodium_mg IS NULL OR sodium_mg BETWEEN 0 AND 3000),
 serving_g numeric(6,1),
 official_url text NOT NULL CHECK (official_url ~ '^https://'),
 is_bulk boolean NOT NULL DEFAULT false,
 checked_on date NOT NULL DEFAULT current_date,
 active boolean NOT NULL DEFAULT true
);
ALTER TABLE public.garmin_gel_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can view verified gel catalogue" ON public.garmin_gel_catalog
 FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.garmin_gel_catalog FROM anon,authenticated;
GRANT SELECT ON public.garmin_gel_catalog TO authenticated;

CREATE TABLE IF NOT EXISTS public.garmin_gel_inventory (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 catalog_id text REFERENCES public.garmin_gel_catalog(id) ON DELETE RESTRICT,
 custom_brand text,
 custom_name text,
 custom_carbs_g numeric(6,1) CHECK (custom_carbs_g IS NULL OR custom_carbs_g BETWEEN 0 AND 250),
 custom_caffeine_mg integer CHECK (custom_caffeine_mg IS NULL OR custom_caffeine_mg BETWEEN 0 AND 500),
 custom_sodium_mg integer CHECK (custom_sodium_mg IS NULL OR custom_sodium_mg BETWEEN 0 AND 3000),
 flavor_note text NOT NULL DEFAULT '' CHECK (char_length(flavor_note) <= 100),
 quantity integer NOT NULL DEFAULT 0 CHECK (quantity BETWEEN 0 AND 500),
 priority integer NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
 note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT custom_or_catalog CHECK (
  (catalog_id IS NOT NULL AND custom_brand IS NULL AND custom_name IS NULL)
  OR
  (catalog_id IS NULL AND char_length(trim(custom_brand)) BETWEEN 1 AND 80
   AND char_length(trim(custom_name)) BETWEEN 2 AND 120 AND custom_carbs_g IS NOT NULL)
 )
);
CREATE INDEX IF NOT EXISTS garmin_gel_inventory_user_idx ON public.garmin_gel_inventory(user_id,priority);
ALTER TABLE public.garmin_gel_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own gel inventory read" ON public.garmin_gel_inventory
 FOR SELECT TO authenticated USING (user_id=(select auth.uid()));
CREATE POLICY "own gel inventory add" ON public.garmin_gel_inventory
 FOR INSERT TO authenticated WITH CHECK (user_id=(select auth.uid()));
CREATE POLICY "own gel inventory update" ON public.garmin_gel_inventory
 FOR UPDATE TO authenticated USING (user_id=(select auth.uid()))
 WITH CHECK (user_id=(select auth.uid()));
CREATE POLICY "own gel inventory remove" ON public.garmin_gel_inventory
 FOR DELETE TO authenticated USING (user_id=(select auth.uid()));
REVOKE ALL ON public.garmin_gel_inventory FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.garmin_gel_inventory TO authenticated;
INSERT INTO public.garmin_gel_catalog (id,brand,name,flavor,carbs_g,caffeine_mg,sodium_mg,serving_g,official_url,is_bulk) VALUES
('mau-g100','Maurten','Gel 100','Neutral',25,0,NULL,40,'https://www.maurten.com/de/products/gels',FALSE),
('mau-g100caf','Maurten','Gel 100 Caf 100','Neutral',25,100,NULL,40,'https://www.maurten.com/de/products/gels',FALSE),
('mau-g160','Maurten','Gel 160','Neutral',40,0,NULL,65,'https://www.maurten.com/de/products/gels',FALSE),
('mau-mix480','Maurten','Gel Mix 480','Flask · vorher anrühren',120,0,NULL,NULL,'https://www.maurten.com/de/products/gel-mix-480',TRUE),
('sis-beta','SiS','BETA Fuel Energy Gel','Standard',40,0,NULL,NULL,'https://www.scienceinsport.com/de/energie-gele-sortiment',FALSE),
('sis-beta-elec','SiS','BETA Fuel + Electrolyte Gel','Raspberry & Lemon',40,0,200,NULL,'https://www.scienceinsport.com/de/energie-gele-sortiment',FALSE),
('sis-beta-nootropic','SiS','BETA Fuel + Nootropics Gel','Standard',40,200,NULL,NULL,'https://www.scienceinsport.com/eu/beta-fuel-plus-nootropics-gels-sis',FALSE),
('sis-go','SiS','GO Isotonic Energy Gel','Standard',22,0,NULL,NULL,'https://www.scienceinsport.com/de/energie-gele-sortiment',FALSE),
('sis-go-elec','SiS','GO Energy + Electrolyte Gel','Standard',22,0,NULL,NULL,'https://www.scienceinsport.com/de/energie-gele-sortiment',FALSE),
('sis-go-caf75','SiS','GO Energy + Caffeine Gel','75 mg Koffein',22,75,NULL,NULL,'https://www.scienceinsport.com/de/go-isotonic-energie-plus-koffein-gele-sis',FALSE),
('sis-go-caf150','SiS','GO Energy + Caffeine Gel','Double Espresso · 150 mg Koffein',22,150,NULL,NULL,'https://www.scienceinsport.com/de/go-energie-koffein-gel-30-packung-doppelter-espresso',FALSE),
('226-he76-neutral','226ERS','High Energy Gel 76 g','Neutral',50,0,NULL,76,'https://www.226ers.com/de/products/high-energy-gel-76g-62292',FALSE),
('226-he76-banana','226ERS','High Energy Gel 76 g','Banane',50,0,NULL,76,'https://www.226ers.com/de/products/high-energy-gel-76g-62292',FALSE),
('226-he76-salty','226ERS','High Energy Gel 76 g','Salty Strawberry',50,0,250,76,'https://www.226ers.com/de/products/high-energy-gel-76g-62292',FALSE),
('226-he76-peanut','226ERS','High Energy Gel 76 g','Peanut & Honey',50,0,250,76,'https://www.226ers.com/de/products/high-energy-gel-76g-62292',FALSE),
('226-he76-cherry','226ERS','High Energy Gel 76 g','Kirsche · Koffein',50,160,NULL,76,'https://www.226ers.com/de/products/high-energy-gel-76g-62292',FALSE),
('226-he76-espresso','226ERS','High Energy Gel 76 g','Espresso · Koffein',50,80,NULL,76,'https://www.226ers.com/de/products/high-energy-gel-76g-62292',FALSE),
('226-he45-lemon','226ERS','High Energy Gel XS 45 g','Zitrone',30,0,NULL,45,'https://www.226ers.com/de/products/hochenergie-gel-xs-45g-energiegel-mit-cyclodextrina',FALSE),
('226-he45-salty','226ERS','High Energy Gel XS 45 g','Salty Strawberry',30,0,150,45,'https://www.226ers.com/de/products/hochenergie-gel-xs-45g-energiegel-mit-cyclodextrina',FALSE),
('226-he45-cherry','226ERS','High Energy Gel XS 45 g','Kirsche · Koffein',30,95,NULL,45,'https://www.226ers.com/de/products/hochenergie-gel-xs-45g-energiegel-mit-cyclodextrina',FALSE),
('226-fr80-strawberry','226ERS','High Fructose Gel 80 g','Erdbeere',55,0,250,80,'https://www.226ers.com/de/products/high-fructose-gel-energie-gel-80g-220566',FALSE),
('226-fr80-banana','226ERS','High Fructose Gel 80 g','Banane',55,0,250,80,'https://www.226ers.com/de/products/high-fructose-gel-energie-gel-80g-220566',FALSE),
('226-fr80-neutral','226ERS','High Fructose Gel 80 g','Neutral',55,0,250,80,'https://www.226ers.com/de/products/high-fructose-gel-energie-gel-80g-220566',FALSE),
('226-fr80-spec','226ERS','High Fructose Gel 80 g','Spekulatius',55,0,250,80,'https://www.226ers.com/de/products/high-fructose-gel-energie-gel-80g-220566',FALSE),
('226-fr80-cola','226ERS','High Fructose Gel 80 g','Cola · Koffein',55,100,250,80,'https://www.226ers.com/de/products/high-fructose-gel-energie-gel-80g-220566',FALSE),
('226-fr80-cherry','226ERS','High Fructose Gel 80 g','Kirsche · Koffein',55,160,250,80,'https://www.226ers.com/de/products/high-fructose-gel-energie-gel-80g-220566',FALSE),
('226-fr80-lemon','226ERS','High Fructose Gel 80 g','Zitrone',55,0,250,80,'https://www.226ers.com/de/products/high-fructose-gel-energie-gel-80g-220566',FALSE),
('226-fr44-strawberry','226ERS','High Fructose Gel XS 44 g','Erdbeere',30.4,0,140,44,'https://www.226ers.com/de/products/high-fructose-gel-xs-44g-220687',FALSE),
('226-fr44-spec','226ERS','High Fructose Gel XS 44 g','Spekulatius',30.4,0,140,44,'https://www.226ers.com/de/products/high-fructose-gel-xs-44g-220687',FALSE),
('226-fr44-cola','226ERS','High Fructose Gel XS 44 g','Cola · Koffein',30.4,55,140,44,'https://www.226ers.com/de/products/high-fructose-gel-xs-44g-220687',FALSE),
('226-iso68','226ERS','Isotonic Gel 68 g','Standard',22,0,NULL,68,'https://www.226ers.com/de/products/isotonic-gel-68g-62305',FALSE),
('226-ice68','226ERS','Isotonic Ice Gel 68 g','Menthol',NULL,NULL,NULL,68,'https://www.226ers.com/de/collections/energie-gels',FALSE)
ON CONFLICT (id) DO UPDATE SET brand=EXCLUDED.brand,name=EXCLUDED.name,flavor=EXCLUDED.flavor,carbs_g=EXCLUDED.carbs_g,caffeine_mg=EXCLUDED.caffeine_mg,sodium_mg=EXCLUDED.sodium_mg,serving_g=EXCLUDED.serving_g,official_url=EXCLUDED.official_url,is_bulk=EXCLUDED.is_bulk;
