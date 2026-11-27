-- Dados fictícios para desenvolvimento local. As contas usam DemoAgenda!2026.
BEGIN;
SET LOCAL search_path TO agenda, pg_catalog;
INSERT INTO tenants (id,slug,name,kind,site_settings) VALUES (
  '10000000-0000-4000-8000-000000000001', 'navalha-e-cia', 'Navalha & Cia.', 'BARBEARIA',
  '{"headline":"Corte no seu estilo.","bio":"Do degradê ao clássico, escolha seu serviço e reserve com seu barbeiro.","address":"Fortaleza, CE","banner":"/barbearia.webp","primary":"#17231c","secondary":"#d6ed99"}'
) ON CONFLICT DO NOTHING;
UPDATE tenants SET feature_flags=feature_flags||'{"enable_google_calendar":true}'::jsonb
WHERE slug='navalha-e-cia' AND NOT(feature_flags ? 'enable_google_calendar');

INSERT INTO users (id,tenant_id,role,name,phone,password_hash) VALUES
  ('10000000-0000-4000-8000-000000000010',NULL,'SUPER_ADMIN','Admin da plataforma','+5585900000001','$2b$12$rQDN6z96W3XITchv5sJQE.264.NN.U7hMkCDBNJvy/qYpY77cZE46'),
  ('10000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','OWNER','Rafael Almeida','+5585900000002','$2b$12$rQDN6z96W3XITchv5sJQE.264.NN.U7hMkCDBNJvy/qYpY77cZE46')
ON CONFLICT DO NOTHING;

INSERT INTO professionals (id,tenant_id,name,photo) VALUES
  ('10000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000001','Rafael',''),
  ('10000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000001','Diego',''),
  ('10000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000001','Camila','')
ON CONFLICT DO NOTHING;

INSERT INTO users (id,tenant_id,role,professional_id,name,phone,password_hash) VALUES
  ('10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001','STAFF','10000000-0000-4000-8000-000000000020','Rafael Almeida','+5585900000003','$2b$12$rQDN6z96W3XITchv5sJQE.264.NN.U7hMkCDBNJvy/qYpY77cZE46'),
  ('10000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001','STAFF','10000000-0000-4000-8000-000000000021','Diego','+5585900000004','$2b$12$rQDN6z96W3XITchv5sJQE.264.NN.U7hMkCDBNJvy/qYpY77cZE46'),
  ('10000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000001','STAFF','10000000-0000-4000-8000-000000000022','Camila','+5585900000005','$2b$12$rQDN6z96W3XITchv5sJQE.264.NN.U7hMkCDBNJvy/qYpY77cZE46') ON CONFLICT DO NOTHING;

INSERT INTO services (id,tenant_id,name,description,category,photo,price_cents,duration_minutes) VALUES
  ('10000000-0000-4000-8000-000000000030','10000000-0000-4000-8000-000000000001','Corte clássico','Tesoura, máquina e acabamento na navalha.','Cabelo','/corte.webp',5500,40),
  ('10000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000001','Barba completa','Toalha quente, desenho e finalização com óleo.','Barba','/barba.webp',4000,30),
  ('10000000-0000-4000-8000-000000000032','10000000-0000-4000-8000-000000000001','Corte + barba','Corte e barba em um só atendimento.','Combos','/combo.webp',8500,60)
ON CONFLICT DO NOTHING;

INSERT INTO professional_services (tenant_id,professional_id,service_id)
SELECT p.tenant_id,p.id,s.id FROM professionals p JOIN services s ON s.tenant_id=p.tenant_id
WHERE p.id IN ('10000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000022')
AND s.id IN ('10000000-0000-4000-8000-000000000030','10000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000032')
ON CONFLICT DO NOTHING;

INSERT INTO products (id,tenant_id,name,description,category,photo,price_cents) VALUES
  ('10000000-0000-4000-8000-000000000040','10000000-0000-4000-8000-000000000001','Pomada matte','Fixação média e efeito seco · 80 g','Cabelo','/pomada.webp',4900),
  ('10000000-0000-4000-8000-000000000041','10000000-0000-4000-8000-000000000001','Óleo para barba','Óleo de jojoba e cedro · 30 ml','Barba','/oleo.webp',4500),
  ('10000000-0000-4000-8000-000000000042','10000000-0000-4000-8000-000000000001','Shampoo diário','Limpeza suave com hortelã · 250 ml','Cabelo','/shampoo.webp',3900)
ON CONFLICT DO NOTHING;

INSERT INTO working_hours (tenant_id,weekday,closed,opens_at,closes_at,break_start,break_end)
SELECT '10000000-0000-4000-8000-000000000001',day,day IN (0,1),CASE WHEN day>=2 THEN '09:00'::time END,
CASE WHEN day=6 THEN '17:00'::time WHEN day>=2 THEN '19:00'::time END,
CASE WHEN day>=2 THEN '12:00'::time END,CASE WHEN day>=2 THEN '13:00'::time END FROM generate_series(0,6) AS days(day)
ON CONFLICT DO NOTHING;

INSERT INTO service_categories (tenant_id,name) SELECT DISTINCT tenant_id,category FROM services WHERE category<>'' AND deleted_at IS NULL ON CONFLICT DO NOTHING;
INSERT INTO categories(tenant_id,name,type)
  SELECT DISTINCT tenant_id,category,'SERVICE' FROM services WHERE category<>'' AND deleted_at IS NULL
  UNION SELECT DISTINCT tenant_id,category,'PRODUCT' FROM products WHERE category<>'' AND deleted_at IS NULL ON CONFLICT DO NOTHING;
UPDATE services s SET category_id=c.id FROM categories c WHERE c.tenant_id=s.tenant_id AND c.type='SERVICE' AND c.name=s.category AND s.category_id IS NULL;
UPDATE products p SET category_id=c.id FROM categories c WHERE c.tenant_id=p.tenant_id AND c.type='PRODUCT' AND c.name=p.category AND p.category_id IS NULL;
UPDATE products SET stock_quantity=12,sku='NAV-'||right(id::text,3)
WHERE id IN ('10000000-0000-4000-8000-000000000040','10000000-0000-4000-8000-000000000041','10000000-0000-4000-8000-000000000042') AND sku='';
INSERT INTO loyalty_config(tenant_id,is_active,program_name,reward_value,rules_description) VALUES
 ('10000000-0000-4000-8000-000000000001',true,'Clube Navalha de Ouro',1500,'Ganhe um selo por atendimento concluído. Com 10 selos, solicite R$ 15 de desconto no balcão.') ON CONFLICT DO NOTHING;
COMMIT;
