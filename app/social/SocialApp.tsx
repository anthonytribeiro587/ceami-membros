'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coffee,
  Gift,
  HeartHandshake,
  History,
  Home,
  LogOut,
  Minus,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShoppingBasket,
  Trash2,
  Undo2,
  SlidersHorizontal,
  Users,
  Wheat,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatPhoneBR, phoneDigits } from '@/lib/formatters';

type Screen = 'home' | 'stock' | 'donation' | 'baskets' | 'families' | 'more' | 'history' | 'products';
type StockFilter = 'all' | 'low' | 'expiring';
type Category = 'alimentos' | 'higiene' | 'limpeza' | 'roupas' | 'outros';

type Product = {
  id: string;
  name: string;
  package_label: string;
  unit_label: string;
  category: Category;
  min_stock: number;
  tracks_expiry: boolean;
  is_active: boolean;
  created_at?: string;
};

type Batch = {
  id: string;
  product_id: string;
  quantity_available: number;
  expires_on: string | null;
  created_at: string;
};

type BasketTemplate = {
  id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
};

type BasketTemplateItem = {
  id: string;
  template_id: string;
  product_id: string;
  quantity: number;
};

type Assembly = {
  id: string;
  quantity_prepared: number;
  quantity_available: number;
  created_at: string;
  created_by: string;
};

type Family = {
  id: string;
  responsible_name: string;
  phone: string | null;
  neighborhood: string | null;
  household_size: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string;
};

type Donation = {
  id: string;
  donor_name: string | null;
  note: string | null;
  received_on: string;
  created_by: string;
  created_at: string;
};

type DonationItem = {
  id: string;
  donation_id: string;
  product_id: string;
  quantity: number;
  expires_on: string | null;
};

type Movement = {
  id: string;
  product_id: string;
  movement_type: 'donation' | 'basket_prepare' | 'adjustment' | 'expired' | 'direct_delivery';
  quantity_delta: number;
  note: string | null;
  created_by: string;
  created_at: string;
};

type Delivery = {
  id: string;
  family_id: string;
  delivery_type: 'basket' | 'avulsa';
  quantity_baskets: number | null;
  note: string | null;
  delivered_on: string;
  created_by: string;
  created_at: string;
};

type DeliveryItem = {
  id: string;
  delivery_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
};

type Reversal = {
  id: string;
  entity_type: 'donation' | 'assembly' | 'delivery' | 'movement';
  entity_id: string;
  reason: string;
  created_by: string;
  created_at: string;
};

type Profile = { id: string; full_name: string; role?: string };
type DonationDraftItem = { productId: string; quantity: number; expiresOn: string };

type ProductDraft = {
  id?: string;
  name: string;
  packageLabel: string;
  unitLabel: string;
  category: Category;
  minStock: string;
  tracksExpiry: boolean;
};

type FamilyDraft = {
  id?: string;
  responsibleName: string;
  phone: string;
  neighborhood: string;
  householdSize: string;
  notes: string;
};

type Activity = {
  id: string;
  type: 'donation' | 'movement' | 'delivery' | 'assembly';
  entityType: 'donation' | 'assembly' | 'delivery' | 'movement';
  entityId: string;
  title: string;
  detail: string;
  createdAt: string;
  actorId: string;
  tone: 'positive' | 'negative' | 'neutral';
  reversible: boolean;
};

const CATEGORY_LABEL: Record<Category, string> = {
  alimentos: 'Alimentos',
  higiene: 'Higiene',
  limpeza: 'Limpeza',
  roupas: 'Roupas',
  outros: 'Outros',
};

const DEMO_PRODUCTS: Product[] = [
  { id: 'demo-arroz', name: 'Arroz', package_label: '5 kg', unit_label: 'pacotes', category: 'alimentos', min_stock: 10, tracks_expiry: true, is_active: true },
  { id: 'demo-feijao', name: 'Feijão', package_label: '1 kg', unit_label: 'pacotes', category: 'alimentos', min_stock: 15, tracks_expiry: true, is_active: true },
  { id: 'demo-oleo', name: 'Óleo', package_label: '900 ml', unit_label: 'unidades', category: 'alimentos', min_stock: 10, tracks_expiry: true, is_active: true },
  { id: 'demo-macarrao', name: 'Macarrão', package_label: '500 g', unit_label: 'pacotes', category: 'alimentos', min_stock: 12, tracks_expiry: true, is_active: true },
  { id: 'demo-acucar', name: 'Açúcar', package_label: '1 kg', unit_label: 'pacotes', category: 'alimentos', min_stock: 8, tracks_expiry: true, is_active: true },
  { id: 'demo-cafe', name: 'Café', package_label: '500 g', unit_label: 'pacotes', category: 'alimentos', min_stock: 8, tracks_expiry: true, is_active: true },
  { id: 'demo-leite', name: 'Leite', package_label: '1 L', unit_label: 'caixas', category: 'alimentos', min_stock: 10, tracks_expiry: true, is_active: true },
];

const DEMO_BATCHES: Batch[] = [
  { id: 'b1', product_id: 'demo-arroz', quantity_available: 38, expires_on: '2027-03-01', created_at: '2026-09-20T12:00:00Z' },
  { id: 'b2', product_id: 'demo-feijao', quantity_available: 12, expires_on: '2026-12-01', created_at: '2026-09-19T12:00:00Z' },
  { id: 'b3', product_id: 'demo-oleo', quantity_available: 6, expires_on: null, created_at: '2026-09-18T12:00:00Z' },
  { id: 'b4', product_id: 'demo-macarrao', quantity_available: 31, expires_on: '2027-04-01', created_at: '2026-09-18T12:00:00Z' },
  { id: 'b5', product_id: 'demo-acucar', quantity_available: 18, expires_on: '2027-02-01', created_at: '2026-09-17T12:00:00Z' },
  { id: 'b6', product_id: 'demo-cafe', quantity_available: 16, expires_on: '2027-01-01', created_at: '2026-09-16T12:00:00Z' },
  { id: 'b7', product_id: 'demo-leite', quantity_available: 9, expires_on: '2026-10-20', created_at: '2026-09-15T12:00:00Z' },
];

const DEMO_TEMPLATE: BasketTemplate = { id: 'demo-template', name: 'Cesta básica padrão', is_default: true, is_active: true };
const DEMO_TEMPLATE_ITEMS: BasketTemplateItem[] = [
  { id: 'ti1', template_id: 'demo-template', product_id: 'demo-arroz', quantity: 1 },
  { id: 'ti2', template_id: 'demo-template', product_id: 'demo-feijao', quantity: 2 },
  { id: 'ti3', template_id: 'demo-template', product_id: 'demo-oleo', quantity: 1 },
  { id: 'ti4', template_id: 'demo-template', product_id: 'demo-macarrao', quantity: 2 },
  { id: 'ti5', template_id: 'demo-template', product_id: 'demo-acucar', quantity: 1 },
];

const DEMO_FAMILIES: Family[] = [
  { id: 'family-1', responsible_name: 'Maria Oliveira', phone: '51999990001', neighborhood: 'Centro — Sapucaia do Sul', household_size: 4, notes: null, is_active: true, created_at: '2026-08-10T12:00:00Z', created_by: 'demo-user' },
  { id: 'family-2', responsible_name: 'José da Silva', phone: '51999990002', neighborhood: 'Primor', household_size: 3, notes: null, is_active: true, created_at: '2026-08-12T12:00:00Z', created_by: 'demo-user' },
  { id: 'family-3', responsible_name: 'Ana Souza', phone: '51999990003', neighborhood: 'Pasqualini', household_size: 5, notes: null, is_active: true, created_at: '2026-08-15T12:00:00Z', created_by: 'demo-user' },
];

const DEMO_ASSEMBLIES: Assembly[] = [
  { id: 'a1', quantity_prepared: 15, quantity_available: 7, created_at: '2026-09-18T12:00:00Z', created_by: 'demo-user' },
];

const DEMO_DELIVERIES: Delivery[] = [
  { id: 'd1', family_id: 'family-1', delivery_type: 'basket', quantity_baskets: 1, note: null, delivered_on: '2026-08-18', created_at: '2026-08-18T14:00:00Z', created_by: 'demo-user' },
  { id: 'd2', family_id: 'family-2', delivery_type: 'basket', quantity_baskets: 2, note: null, delivered_on: '2026-09-10', created_at: '2026-09-10T14:00:00Z', created_by: 'demo-user' },
];

const DEMO_DELIVERY_ITEMS: DeliveryItem[] = [];

const DEMO_REVERSALS: Reversal[] = [];

const DEMO_DONATIONS: Donation[] = [
  { id: 'don1', donor_name: 'Comunidade CEAMI', note: 'Doações do culto', received_on: '2026-09-20', created_at: '2026-09-20T16:00:00Z', created_by: 'demo-user' },
];

const DEMO_DONATION_ITEMS: DonationItem[] = [
  { id: 'di1', donation_id: 'don1', product_id: 'demo-arroz', quantity: 10, expires_on: '2027-03-01' },
  { id: 'di2', donation_id: 'don1', product_id: 'demo-feijao', quantity: 8, expires_on: '2026-12-01' },
];

const DEMO_MOVEMENTS: Movement[] = [
  { id: 'm1', product_id: 'demo-arroz', movement_type: 'donation', quantity_delta: 10, note: 'Doações do culto', created_at: '2026-09-20T16:00:00Z', created_by: 'demo-user' },
  { id: 'm2', product_id: 'demo-feijao', movement_type: 'donation', quantity_delta: 8, note: 'Doações do culto', created_at: '2026-09-20T16:00:00Z', created_by: 'demo-user' },
];

function productTitle(product: Product) {
  return `${product.name}${product.package_label ? ` ${product.package_label}` : ''}`;
}

function quantityFor(productId: string, batches: Batch[]) {
  return batches.filter((batch) => batch.product_id === productId).reduce((sum, batch) => sum + Number(batch.quantity_available || 0), 0);
}

function nextExpiry(productId: string, batches: Batch[]) {
  return batches
    .filter((batch) => batch.product_id === productId && batch.quantity_available > 0 && batch.expires_on)
    .map((batch) => batch.expires_on as string)
    .sort()[0] || null;
}

function formatMonthYear(value: string | null) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(date).replace('.', '');
}

function formatDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

function daysSinceDate(value: string) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.floor((today.getTime() - date.getTime()) / 86_400_000);
}

function alertUntilDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  date.setDate(date.getDate() + 15);
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

function deliveryTypeLabel(delivery: Delivery) {
  return delivery.delivery_type === 'avulsa' ? 'entrega avulsa' : `${delivery.quantity_baskets || 0} cesta(s)`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function daysUntil(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const target = new Date(`${value.slice(0, 10)}T12:00:00`).getTime();
  return Math.ceil((target - Date.now()) / 86_400_000);
}

function initials(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CE';
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || 'Equipe';
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function categoryIcon(product: Product) {
  const name = product.name.toLocaleLowerCase('pt-BR');
  if (name.includes('arroz') || name.includes('feijão') || name.includes('açúcar') || name.includes('macarrão')) return <Wheat />;
  if (name.includes('café')) return <Coffee />;
  return <Package />;
}

function stockState(product: Product, batches: Batch[]) {
  const quantity = quantityFor(product.id, batches);
  if (quantity <= 0) return { label: 'Precisamos receber', tone: 'danger' as const };
  if (quantity <= product.min_stock) return { label: 'Estoque baixo', tone: 'warning' as const };
  return { label: 'Estoque adequado', tone: 'success' as const };
}

function basketCapacity(products: Product[], batches: Batch[], items: BasketTemplateItem[]) {
  if (!items.length) return 0;
  const capacities = items.map((item) => {
    const product = products.find((candidate) => candidate.id === item.product_id);
    if (!product || item.quantity <= 0) return 0;
    return Math.floor(quantityFor(product.id, batches) / item.quantity);
  });
  return Math.max(0, Math.min(...capacities));
}

function formatPhoneInput(value: string) {
  const digits = phoneDigits(value).slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function friendlyError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value || '');
  if (/relation .* does not exist|PGRST205|social_products/i.test(message)) {
    return 'O banco do CEAMI Social ainda precisa receber a migration do módulo.';
  }
  return message || 'Não foi possível concluir esta operação.';
}

function SummaryCard({ icon, value, label, tone = 'blue' }: { icon: ReactNode; value: number; label: string; tone?: 'blue' | 'orange' | 'green' | 'red' }) {
  return <article className={`social-summary-card ${tone}`}><div>{icon}</div><strong>{value}</strong><span>{label}</span></article>;
}

function QuantityStepper({ value, onChange, min = 1, max = 999 }: { value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  return (
    <div className="social-stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label="Diminuir"><Minus /></button>
      <strong>{value}</strong>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label="Aumentar"><Plus /></button>
    </div>
  );
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="social-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="social-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" onClick={onClose} aria-label="Fechar"><X /></button></header>
        <div className="social-modal-body">{children}</div>
      </section>
    </div>
  );
}

export default function SocialApp({ demoMode = false }: { demoMode?: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [screen, setScreen] = useState<Screen>('home');
  const [greetingLabel, setGreetingLabel] = useState('Olá');
  const [loading, setLoading] = useState(!demoMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [profile, setProfile] = useState<Profile | null>(demoMode ? { id: 'demo-user', full_name: 'Maria', role: 'social' } : null);
  const [profiles, setProfiles] = useState<Profile[]>(demoMode ? [{ id: 'demo-user', full_name: 'Maria' }] : []);
  const [products, setProducts] = useState<Product[]>(demoMode ? DEMO_PRODUCTS : []);
  const [batches, setBatches] = useState<Batch[]>(demoMode ? DEMO_BATCHES : []);
  const [basketTemplate, setBasketTemplate] = useState<BasketTemplate | null>(demoMode ? DEMO_TEMPLATE : null);
  const [templateItems, setTemplateItems] = useState<BasketTemplateItem[]>(demoMode ? DEMO_TEMPLATE_ITEMS : []);
  const [families, setFamilies] = useState<Family[]>(demoMode ? DEMO_FAMILIES : []);
  const [assemblies, setAssemblies] = useState<Assembly[]>(demoMode ? DEMO_ASSEMBLIES : []);
  const [donations, setDonations] = useState<Donation[]>(demoMode ? DEMO_DONATIONS : []);
  const [donationItems, setDonationItems] = useState<DonationItem[]>(demoMode ? DEMO_DONATION_ITEMS : []);
  const [movements, setMovements] = useState<Movement[]>(demoMode ? DEMO_MOVEMENTS : []);
  const [deliveries, setDeliveries] = useState<Delivery[]>(demoMode ? DEMO_DELIVERIES : []);
  const [deliveryItems, setDeliveryItems] = useState<DeliveryItem[]>(demoMode ? DEMO_DELIVERY_ITEMS : []);
  const [reversals, setReversals] = useState<Reversal[]>(demoMode ? DEMO_REVERSALS : []);

  const [stockQuery, setStockQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [stockVisible, setStockVisible] = useState(12);
  const [familyQuery, setFamilyQuery] = useState('');
  const [familyVisible, setFamilyVisible] = useState(10);
  const [historyVisible, setHistoryVisible] = useState(15);
  const [productVisible, setProductVisible] = useState(12);

  const [donationSearch, setDonationSearch] = useState('');
  const [donationDraft, setDonationDraft] = useState<DonationDraftItem[]>([]);
  const [donorName, setDonorName] = useState('');
  const [donationNote, setDonationNote] = useState('');
  const [selectedDonationProductId, setSelectedDonationProductId] = useState('');
  const [donationQty, setDonationQty] = useState(1);
  const [donationExpiry, setDonationExpiry] = useState('');
  const [donationReviewOpen, setDonationReviewOpen] = useState(false);

  const [prepareQty, setPrepareQty] = useState(1);
  const [prepareBasketOpen, setPrepareBasketOpen] = useState(false);
  const [deliveryQty, setDeliveryQty] = useState(1);
  const [deliveryFamilyId, setDeliveryFamilyId] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'basket' | 'avulsa'>('basket');
  const [confirmRecentDelivery, setConfirmRecentDelivery] = useState(false);
  const [directDeliveryDraft, setDirectDeliveryDraft] = useState<Record<string, number>>({});

  const [productModal, setProductModal] = useState<ProductDraft | null>(null);
  const [familyModal, setFamilyModal] = useState<FamilyDraft | null>(null);
  const [familyDeleteTarget, setFamilyDeleteTarget] = useState<Family | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [adjustDelta, setAdjustDelta] = useState(1);
  const [adjustDirection, setAdjustDirection] = useState<'add' | 'remove'>('add');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustExpiry, setAdjustExpiry] = useState('');
  const [basketConfigOpen, setBasketConfigOpen] = useState(false);
  const [basketConfig, setBasketConfig] = useState<Record<string, number>>({});
  const [reverseTarget, setReverseTarget] = useState<Activity | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseError, setReverseError] = useState('');

  useEffect(() => {
    setGreetingLabel(greeting());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setConfirmRecentDelivery(false);
  }, [deliveryFamilyId, deliveryMode]);

  useEffect(() => {
    setStockVisible(12);
    setFamilyVisible(10);
    setHistoryVisible(15);
    setProductVisible(12);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [screen]);

  const load = useCallback(async () => {
    if (demoMode) return;
    setLoading(true);
    setError('');
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Sessão expirada. Entre novamente.');

      const [profileResult, productsResult, batchesResult, templateResult, familiesResult, assembliesResult, donationsResult, donationItemsResult, movementsResult, deliveriesResult, deliveryItemsResult, reversalsResult, actorsResult] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role').eq('id', auth.user.id).maybeSingle(),
        supabase.from('social_products').select('*').order('name'),
        supabase.from('social_stock_batches').select('id, product_id, quantity_available, expires_on, created_at').gt('quantity_available', 0).order('created_at', { ascending: false }),
        supabase.from('social_basket_templates').select('*').eq('is_default', true).eq('is_active', true).maybeSingle(),
        supabase.from('social_families').select('*').order('responsible_name'),
        supabase.from('social_basket_assemblies').select('*').order('created_at', { ascending: false }),
        supabase.from('social_donations').select('*').order('created_at', { ascending: false }).limit(60),
        supabase.from('social_donation_items').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('social_inventory_movements').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('social_deliveries').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('social_delivery_items').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.from('social_reversals').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.rpc('social_actor_profiles'),
      ]);

      const firstError = [profileResult, productsResult, batchesResult, templateResult, familiesResult, assembliesResult, donationsResult, donationItemsResult, movementsResult, deliveriesResult, deliveryItemsResult, reversalsResult, actorsResult].find((result) => result.error)?.error;
      if (firstError) throw new Error(firstError.message);

      const loadedProfile = profileResult.data as Profile | null;
      const loadedTemplate = templateResult.data as BasketTemplate | null;
      setProfile(loadedProfile);
      setProducts((productsResult.data || []) as Product[]);
      setBatches((batchesResult.data || []) as Batch[]);
      setBasketTemplate(loadedTemplate);
      setFamilies((familiesResult.data || []) as Family[]);
      setAssemblies((assembliesResult.data || []) as Assembly[]);
      setDonations((donationsResult.data || []) as Donation[]);
      setDonationItems((donationItemsResult.data || []) as DonationItem[]);
      setMovements((movementsResult.data || []) as Movement[]);
      setDeliveries((deliveriesResult.data || []) as Delivery[]);
      setDeliveryItems((deliveryItemsResult.data || []) as DeliveryItem[]);
      setReversals((reversalsResult.data || []) as Reversal[]);
      setProfiles((actorsResult.data || []) as Profile[]);

      if (loadedTemplate) {
        const { data: items, error: itemsError } = await supabase
          .from('social_basket_template_items')
          .select('*')
          .eq('template_id', loadedTemplate.id)
          .order('created_at');
        if (itemsError) throw new Error(itemsError.message);
        setTemplateItems((items || []) as BasketTemplateItem[]);
      } else {
        setTemplateItems([]);
      }
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setLoading(false);
    }
  }, [demoMode, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeProducts = useMemo(() => products.filter((product) => product.is_active), [products]);
  const readyBaskets = useMemo(() => assemblies.reduce((sum, assembly) => sum + Number(assembly.quantity_available || 0), 0), [assemblies]);
  const capacity = useMemo(() => basketCapacity(activeProducts, batches, templateItems), [activeProducts, batches, templateItems]);
  const lowStockCount = useMemo(() => activeProducts.filter((product) => quantityFor(product.id, batches) <= product.min_stock).length, [activeProducts, batches]);
  const expiringCount = useMemo(() => activeProducts.filter((product) => { const days = daysUntil(nextExpiry(product.id, batches)); return days >= 0 && days <= 60; }).length, [activeProducts, batches]);

  const deliveriesThisMonth = useMemo(() => {
    const now = new Date();
    return deliveries.filter((delivery) => {
      if (reversals.some((reversal) => reversal.entity_type === 'delivery' && reversal.entity_id === delivery.id)) return false;
      const date = new Date(`${delivery.delivered_on}T12:00:00`);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length;
  }, [deliveries, reversals]);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const familyMap = useMemo(() => new Map(families.map((family) => [family.id, family])), [families]);
  const profileMap = useMemo(() => new Map(profiles.map((item) => [item.id, item.full_name])), [profiles]);

  const filteredStock = useMemo(() => {
    const query = stockQuery.trim().toLocaleLowerCase('pt-BR');
    return activeProducts.filter((product) => {
      const quantity = quantityFor(product.id, batches);
      const expiryDays = daysUntil(nextExpiry(product.id, batches));
      if (stockFilter === 'low' && quantity > product.min_stock) return false;
      if (stockFilter === 'expiring' && !(expiryDays >= 0 && expiryDays <= 60)) return false;
      if (query && !productTitle(product).toLocaleLowerCase('pt-BR').includes(query)) return false;
      return true;
    });
  }, [activeProducts, batches, stockFilter, stockQuery]);

  const filteredFamilies = useMemo(() => {
    const query = familyQuery.trim().toLocaleLowerCase('pt-BR');
    return families.filter((family) => family.is_active && (!query || `${family.responsible_name} ${family.neighborhood || ''} ${family.phone || ''}`.toLocaleLowerCase('pt-BR').includes(query)));
  }, [families, familyQuery]);

  const donationProducts = useMemo(() => {
    const query = donationSearch.trim().toLocaleLowerCase('pt-BR');
    return activeProducts.filter((product) => !query || productTitle(product).toLocaleLowerCase('pt-BR').includes(query)).slice(0, 12);
  }, [activeProducts, donationSearch]);

  const reversalMap = useMemo(() => {
    return new Map(reversals.map((reversal) => [`${reversal.entity_type}:${reversal.entity_id}`, reversal]));
  }, [reversals]);

  const activeDeliveries = useMemo(() => {
    return deliveries.filter((delivery) => !reversalMap.has(`delivery:${delivery.id}`));
  }, [deliveries, reversalMap]);

  const activities = useMemo<Activity[]>(() => {
    const movementActivities = movements
      .filter((movement) => movement.movement_type === 'adjustment' || movement.movement_type === 'expired')
      .map((movement) => {
        const product = productMap.get(movement.product_id);
        const isPositive = movement.quantity_delta > 0;
        const title = movement.movement_type === 'basket_prepare'
          ? 'Itens separados para cestas'
          : movement.movement_type === 'expired'
            ? 'Baixa por validade'
            : 'Ajuste de estoque';
        return {
          id: `movement-${movement.id}`,
          type: 'movement' as const,
          entityType: 'movement' as const,
          entityId: movement.id,
          title,
          detail: `${isPositive ? '+' : ''}${movement.quantity_delta} ${product ? productTitle(product) : 'item'}${movement.note ? ` · ${movement.note}` : ''}`,
          createdAt: movement.created_at,
          actorId: movement.created_by,
          tone: isPositive ? 'positive' as const : 'negative' as const,
          reversible: movement.movement_type === 'adjustment',
        };
      });

    const donationActivities = donations.map((donation) => {
      const items = donationItems.filter((item) => item.donation_id === donation.id);
      const total = items.reduce((sum, item) => sum + item.quantity, 0);
      return {
        id: `donation-${donation.id}`,
        type: 'donation' as const,
        entityType: 'donation' as const,
        entityId: donation.id,
        title: 'Doação recebida',
        detail: `${total} item(ns)${donation.donor_name ? ` · ${donation.donor_name}` : ''}`,
        createdAt: donation.created_at,
        actorId: donation.created_by,
        tone: 'positive' as const,
        reversible: true,
      };
    });

    const deliveryActivities = deliveries.map((delivery) => {
      const familyName = familyMap.get(delivery.family_id)?.responsible_name || 'Família';
      if (delivery.delivery_type === 'avulsa') {
        const items = deliveryItems
          .filter((item) => item.delivery_id === delivery.id)
          .map((item) => {
            const product = productMap.get(item.product_id);
            return `${item.quantity}× ${product ? productTitle(product) : 'item'}`;
          });
        return {
          id: `delivery-${delivery.id}`,
          type: 'delivery' as const,
          entityType: 'delivery' as const,
          entityId: delivery.id,
          title: 'Entrega avulsa',
          detail: `${familyName}${items.length ? ` · ${items.slice(0, 3).join(', ')}${items.length > 3 ? '…' : ''}` : ''}`,
          createdAt: delivery.created_at,
          actorId: delivery.created_by,
          tone: 'neutral' as const,
          reversible: true,
        };
      }

      return {
        id: `delivery-${delivery.id}`,
        type: 'delivery' as const,
        entityType: 'delivery' as const,
        entityId: delivery.id,
        title: 'Cesta entregue',
        detail: `${delivery.quantity_baskets || 0} cesta(s) · ${familyName}`,
        createdAt: delivery.created_at,
        actorId: delivery.created_by,
        tone: 'neutral' as const,
        reversible: true,
      };
    });

    const assemblyActivities = assemblies.map((assembly) => ({
      id: `assembly-${assembly.id}`,
      type: 'assembly' as const,
      entityType: 'assembly' as const,
      entityId: assembly.id,
      title: 'Cestas montadas',
      detail: `${assembly.quantity_prepared} cesta(s) preparadas`,
      createdAt: assembly.created_at,
      actorId: assembly.created_by,
      tone: 'neutral' as const,
      reversible: true,
    }));

    return [...donationActivities, ...movementActivities, ...deliveryActivities, ...assemblyActivities]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [assemblies, deliveries, deliveryItems, donationItems, donations, familyMap, movements, productMap]);

  const lastDeliveryByFamily = useMemo(() => {
    const map = new Map<string, Delivery>();
    for (const delivery of [...activeDeliveries].sort((a, b) => b.delivered_on.localeCompare(a.delivered_on) || b.created_at.localeCompare(a.created_at))) {
      if (!map.has(delivery.family_id)) map.set(delivery.family_id, delivery);
    }
    return map;
  }, [activeDeliveries]);

  async function signOut() {
    if (demoMode) { setToast('No sistema real, este botão encerra a sessão.'); return; }
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  async function refreshData() {
    if (demoMode) { setToast('Dados de demonstração atualizados.'); return; }
    await load();
    setToast('Dados atualizados.');
  }

  async function reverseActivity() {
    if (!reverseTarget || saving) return;
    const reason = reverseReason.trim();
    if (reason.length < 3) {
      setReverseError('Informe o motivo do estorno.');
      return;
    }

    if (demoMode) {
      setReversals((current) => [{
        id: `demo-reversal-${reverseTarget.entityId}`,
        entity_type: reverseTarget.entityType,
        entity_id: reverseTarget.entityId,
        reason,
        created_by: profile?.id || 'demo-user',
        created_at: new Date().toISOString(),
      }, ...current]);
      setReverseTarget(null);
      setReverseReason('');
      setReverseError('');
      setToast('Estorno registrado. O histórico original foi preservado.');
      return;
    }

    setSaving(true);
    setReverseError('');
    const { error: rpcError } = await supabase.rpc('social_reverse_activity', {
      p_entity_type: reverseTarget.entityType,
      p_entity_id: reverseTarget.entityId,
      p_reason: reason,
    });
    setSaving(false);

    if (rpcError) {
      setReverseError(friendlyError(rpcError.message));
      return;
    }

    setReverseTarget(null);
    setReverseReason('');
    setReverseError('');
    await load();
    setToast('Estorno concluído. O registro original foi mantido no histórico.');
  }

  function selectDonationProduct(productId: string) {
    setSelectedDonationProductId(productId);
    setDonationQty(1);
    setDonationExpiry('');
  }

  function addDonationItem() {
    if (!selectedDonationProductId) return;
    setDonationDraft((current) => {
      const existingIndex = current.findIndex((item) => item.productId === selectedDonationProductId && item.expiresOn === donationExpiry);
      if (existingIndex >= 0) {
        return current.map((item, index) => index === existingIndex ? { ...item, quantity: item.quantity + donationQty } : item);
      }
      return [...current, { productId: selectedDonationProductId, quantity: donationQty, expiresOn: donationExpiry }];
    });
    setSelectedDonationProductId('');
    setDonationQty(1);
    setDonationExpiry('');
  }

  async function confirmDonation() {
    if (!donationDraft.length || saving) return;
    if (demoMode) {
      setToast('Doação registrada com sucesso.');
      setDonationDraft([]); setDonorName(''); setDonationNote(''); setDonationReviewOpen(false); setScreen('home');
      return;
    }
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('social_register_donation', {
      p_items: donationDraft.map((item) => ({ product_id: item.productId, quantity: item.quantity, expires_on: item.expiresOn || null })),
      p_donor_name: donorName.trim() || null,
      p_note: donationNote.trim() || null,
      p_received_on: new Date().toLocaleDateString('en-CA'),
    });
    setSaving(false);
    if (rpcError) { setToast(friendlyError(rpcError.message)); return; }
    setDonationDraft([]); setDonorName(''); setDonationNote(''); setDonationReviewOpen(false);
    await load();
    setScreen('home');
    setToast('Doação registrada com sucesso.');
  }

  async function prepareBaskets() {
    if (saving || prepareQty < 1 || prepareQty > capacity) return;
    if (demoMode) { setToast(`${prepareQty} cesta(s) montada(s).`); setPrepareQty(1); setPrepareBasketOpen(false); return; }
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('social_prepare_baskets', { p_quantity: prepareQty });
    setSaving(false);
    if (rpcError) { setToast(friendlyError(rpcError.message)); return; }
    setPrepareQty(1);
    setPrepareBasketOpen(false);
    await load();
    setToast('Cestas montadas e estoque atualizado.');
  }

  async function deliverBaskets() {
    if (saving || !deliveryFamilyId || readyBaskets < 1) return;
    const deliveryQty = 1;
    const last = lastDeliveryByFamily.get(deliveryFamilyId);
    const hasRecent = last ? daysSinceDate(last.delivered_on) >= 0 && daysSinceDate(last.delivered_on) <= 15 : false;
    if (hasRecent && !confirmRecentDelivery) {
      setToast('Confirme o aviso de atendimento recente antes de continuar.');
      return;
    }

    const familyName = familyMap.get(deliveryFamilyId)?.responsible_name || 'família';
    if (demoMode) {
      setToast(`Entrega confirmada: ${deliveryQty} cesta(s) entregue(s) hoje para ${familyName}.`);
      setDeliveryQty(1); setDeliveryNote(''); setConfirmRecentDelivery(false);
      return;
    }

    setSaving(true);
    const { error: rpcError } = await supabase.rpc('social_deliver_baskets_controlled', {
      p_family_id: deliveryFamilyId,
      p_quantity: deliveryQty,
      p_note: deliveryNote.trim() || null,
      p_confirm_recent: confirmRecentDelivery,
    });
    setSaving(false);
    if (rpcError) { setToast(friendlyError(rpcError.message)); return; }

    const today = new Date().toLocaleDateString('en-CA');
    setDeliveryQty(1); setDeliveryNote(''); setConfirmRecentDelivery(false);
    await load();
    setToast(`Entrega confirmada: ${deliveryQty} cesta(s) entregue(s) hoje para ${familyName}. Aviso ativo até ${alertUntilDate(today)}.`);
  }

  async function deliverDirectItems() {
    if (saving || !deliveryFamilyId) return;
    const items = Object.entries(directDeliveryDraft)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({ product_id: productId, quantity }));

    if (!items.length) {
      setToast('Selecione pelo menos um item para a entrega avulsa.');
      return;
    }

    const invalidStock = items.find((item) => item.quantity > quantityFor(item.product_id, batches));
    if (invalidStock) {
      const product = productMap.get(invalidStock.product_id);
      setToast(`Estoque insuficiente para ${product ? productTitle(product) : 'um dos itens'}.`);
      return;
    }

    const last = lastDeliveryByFamily.get(deliveryFamilyId);
    const hasRecent = last ? daysSinceDate(last.delivered_on) >= 0 && daysSinceDate(last.delivered_on) <= 15 : false;
    if (hasRecent && !confirmRecentDelivery) {
      setToast('Confirme o aviso de atendimento recente antes de continuar.');
      return;
    }

    const familyName = familyMap.get(deliveryFamilyId)?.responsible_name || 'família';
    if (demoMode) {
      setDirectDeliveryDraft({});
      setDeliveryNote('');
      setConfirmRecentDelivery(false);
      setToast(`Entrega avulsa registrada hoje para ${familyName}.`);
      return;
    }

    setSaving(true);
    const { error: rpcError } = await supabase.rpc('social_register_direct_delivery', {
      p_family_id: deliveryFamilyId,
      p_items: items,
      p_note: deliveryNote.trim() || null,
      p_confirm_recent: confirmRecentDelivery,
    });
    setSaving(false);
    if (rpcError) { setToast(friendlyError(rpcError.message)); return; }

    const today = new Date().toLocaleDateString('en-CA');
    setDirectDeliveryDraft({});
    setDeliveryNote('');
    setConfirmRecentDelivery(false);
    await load();
    setToast(`Entrega avulsa registrada hoje para ${familyName}. Aviso ativo até ${alertUntilDate(today)}.`);
  }

  async function saveProduct() {
    if (!productModal || saving || !productModal.name.trim()) return;
    const payload = {
      name: productModal.name.trim(),
      package_label: productModal.packageLabel.trim(),
      unit_label: productModal.unitLabel.trim() || 'unidades',
      category: productModal.category,
      min_stock: Math.max(0, Number(productModal.minStock) || 0),
      tracks_expiry: productModal.tracksExpiry,
    };
    if (demoMode) { setToast(productModal.id ? 'Produto atualizado.' : 'Produto cadastrado.'); setProductModal(null); return; }
    setSaving(true);
    const result = productModal.id
      ? await supabase.from('social_products').update(payload).eq('id', productModal.id)
      : await supabase.from('social_products').insert(payload);
    setSaving(false);
    if (result.error) { setToast(friendlyError(result.error.message)); return; }
    const wasEditing = Boolean(productModal.id);
    setProductModal(null);
    await load();
    setToast(wasEditing ? 'Produto atualizado.' : 'Produto cadastrado.');
  }

  async function archiveProduct(product: Product) {
    if (demoMode) { setToast('Produto arquivado.'); return; }
    const { error: updateError } = await supabase.from('social_products').update({ is_active: false }).eq('id', product.id);
    if (updateError) { setToast(friendlyError(updateError.message)); return; }
    await load();
    setToast('Produto arquivado. O histórico foi preservado.');
  }

  async function saveFamily() {
    if (!familyModal || saving || !familyModal.responsibleName.trim()) return;

    const normalizedPhone = phoneDigits(familyModal.phone);
    if (normalizedPhone && normalizedPhone.length !== 10 && normalizedPhone.length !== 11) {
      setToast('Informe um telefone válido com DDD, ou deixe o campo vazio.');
      return;
    }

    const payload = {
      responsible_name: familyModal.responsibleName.trim(),
      phone: normalizedPhone || null,
      neighborhood: familyModal.neighborhood.trim() || null,
      household_size: Math.max(1, Number(familyModal.householdSize) || 1),
      notes: familyModal.notes.trim() || null,
    };
    if (demoMode) { setToast(familyModal.id ? 'Família atualizada.' : 'Família cadastrada.'); setFamilyModal(null); return; }
    setSaving(true);
    const result = familyModal.id
      ? await supabase.from('social_families').update(payload).eq('id', familyModal.id)
      : await supabase.from('social_families').insert(payload);
    setSaving(false);
    if (result.error) { setToast(friendlyError(result.error.message)); return; }
    const wasEditing = Boolean(familyModal.id);
    setFamilyModal(null);
    await load();
    setToast(wasEditing ? 'Família atualizada.' : 'Família cadastrada.');
  }

  async function deleteFamily(family: Family) {
    if (saving) return;
    if (demoMode) {
      setFamilies((current) => current.filter((item) => item.id !== family.id));
      setFamilyDeleteTarget(null);
      setFamilyModal(null);
      setToast('Família excluída.');
      return;
    }

    setSaving(true);
    const { error: deleteError } = await supabase.rpc('social_delete_family', { p_family_id: family.id });
    setSaving(false);
    if (deleteError) {
      setFamilyDeleteTarget(null);
      setToast(friendlyError(deleteError.message));
      return;
    }

    setFamilyDeleteTarget(null);
    setFamilyModal(null);
    await load();
    setToast('Família excluída.');
  }

  async function confirmAdjustment() {
    if (!adjustProduct || !adjustReason.trim() || saving) return;
    const delta = adjustDirection === 'add' ? adjustDelta : -adjustDelta;
    if (demoMode) { setToast('Ajuste registrado no histórico.'); setAdjustProduct(null); return; }
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('social_adjust_stock', {
      p_product_id: adjustProduct.id,
      p_quantity_delta: delta,
      p_note: adjustReason.trim(),
      p_expires_on: adjustDirection === 'add' && adjustExpiry ? adjustExpiry : null,
    });
    setSaving(false);
    if (rpcError) { setToast(friendlyError(rpcError.message)); return; }
    setAdjustProduct(null); setAdjustDelta(1); setAdjustReason(''); setAdjustExpiry('');
    await load();
    setToast('Ajuste registrado no histórico.');
  }

  function openBasketConfig() {
    const current: Record<string, number> = {};
    for (const item of templateItems) current[item.product_id] = item.quantity;
    setBasketConfig(current);
    setBasketConfigOpen(true);
  }

  async function saveBasketConfig() {
    if (!basketTemplate || saving) return;
    const rows = Object.entries(basketConfig)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({ template_id: basketTemplate.id, product_id: productId, quantity }));
    if (!rows.length) { setToast('A cesta precisa ter pelo menos um item.'); return; }
    if (demoMode) { setBasketConfigOpen(false); setToast('Composição da cesta atualizada.'); return; }
    setSaving(true);
    const { error: configError } = await supabase.rpc('social_set_default_basket_items', {
      p_items: rows.map((row) => ({ product_id: row.product_id, quantity: row.quantity })),
    });
    setSaving(false);
    if (configError) { setToast(friendlyError(configError.message)); return; }
    setBasketConfigOpen(false);
    await load();
    setToast('Composição da cesta atualizada.');
  }

  const title = screen === 'home' ? 'CEAMI Social'
    : screen === 'stock' ? 'Estoque'
      : screen === 'donation' ? 'Receber doação'
        : screen === 'baskets' ? 'Entregas'
          : screen === 'families' ? 'Famílias'
            : screen === 'history' ? 'Histórico'
              : screen === 'products' ? 'Produtos' : 'Mais opções';

  if (loading) {
    return <main className="social-app social-loading"><div className="social-loading-mark"><HeartHandshake /></div><strong>Carregando CEAMI Social...</strong><span>Organizando estoque, cestas e famílias.</span></main>;
  }

  return (
    <main className="social-app">
      <aside className="social-desktop-sidebar">
        <div className="social-desktop-brand">
          <img src="/brand/ceami-icon.svg?v=official-2" alt="" />
          <div><strong>CEAMI</strong><span>Social</span></div>
        </div>

        <nav className="social-desktop-nav" aria-label="Navegação do CEAMI Social">
          <button type="button" className={screen === 'home' ? 'active' : ''} onClick={() => setScreen('home')}><Home /><span>Visão geral</span></button>
          <button type="button" className={screen === 'donation' ? 'active' : ''} onClick={() => setScreen('donation')}><Gift /><span>Receber doação</span></button>
          <button type="button" className={screen === 'stock' ? 'active' : ''} onClick={() => setScreen('stock')}><Package /><span>Estoque</span></button>
          <button type="button" className={screen === 'baskets' ? 'active' : ''} onClick={() => setScreen('baskets')}><HeartHandshake /><span>Entregas</span></button>
          <button type="button" className={screen === 'families' ? 'active' : ''} onClick={() => setScreen('families')}><Users /><span>Famílias</span></button>
          <button type="button" className={screen === 'history' ? 'active' : ''} onClick={() => setScreen('history')}><History /><span>Histórico</span></button>
          <button type="button" className={screen === 'products' ? 'active' : ''} onClick={() => setScreen('products')}><Settings2 /><span>Produtos</span></button>
        </nav>

        <div className="social-desktop-profile">
          <span className="social-avatar">{initials(profile?.full_name || 'CEAMI')}</span>
          <div><strong>{profile?.full_name || 'Equipe CEAMI'}</strong><small>Equipe Social</small></div>
          <button type="button" onClick={() => void signOut()} aria-label="Sair"><LogOut /></button>
        </div>
      </aside>

      <header className={`social-topbar ${screen === 'home' ? 'home' : ''}`}>
        {screen === 'home' ? (
          <div className="social-brand"><img src="/brand/ceami-icon.svg?v=official-2" alt="CEAMI" /><strong>CEAMI <span>Social</span></strong></div>
        ) : (
          <button type="button" className="social-back" onClick={() => setScreen('home')} aria-label="Voltar"><ArrowLeft /></button>
        )}
        <h1>{screen === 'home' ? 'Visão geral' : title}</h1>
        <button type="button" className="social-refresh" onClick={() => void refreshData()} aria-label="Atualizar"><RefreshCw /></button>
      </header>

      <div className="social-content">
        {error && (
          <section className="social-setup-alert"><AlertTriangle /><div><strong>CEAMI Social ainda não está ativo no banco</strong><p>{error}</p><small>A interface já está pronta; falta aplicar a migration no Supabase da CEAMI.</small></div></section>
        )}

        {screen === 'home' && (
          <div className="social-home">
            <section className="social-welcome">
              <span>CEAMI SOCIAL</span>
              <h2>{greetingLabel}, {firstName(profile?.full_name || 'Equipe')} <span aria-hidden="true">👋</span></h2>
              <p>O que você deseja fazer hoje?</p>
            </section>

            <section className="social-main-actions" aria-label="Ações principais">
              <button type="button" className="orange" onClick={() => setScreen('donation')}><Gift /><strong>Receber doação</strong><ChevronRight /></button>
              <button type="button" className="blue" onClick={() => setScreen('baskets')}><HeartHandshake /><strong>Registrar entrega</strong><ChevronRight /></button>
              <button type="button" className="blue soft" onClick={() => setScreen('stock')}><Package /><strong>Ver estoque</strong><ChevronRight /></button>
              <button type="button" className="orange soft" onClick={() => setScreen('families')}><Users /><strong>Famílias atendidas</strong><ChevronRight /></button>
            </section>

            <section className="social-home-summary">
              <div className="social-section-title"><div><span>RESUMO DE HOJE</span><h2>Visão rápida</h2></div></div>
              <div className="social-summary-grid">
                <SummaryCard icon={<ShoppingBasket />} value={capacity} label="cestas possíveis" tone="green" />
                <SummaryCard icon={<AlertTriangle />} value={lowStockCount} label="itens com estoque baixo" tone="orange" />
                <SummaryCard icon={<Clock3 />} value={expiringCount} label="produtos vencendo em até 60 dias" tone="red" />
                <SummaryCard icon={<CheckCircle2 />} value={deliveriesThisMonth} label="atendimentos neste mês" tone="blue" />
              </div>
            </section>

            <section className="social-home-lower">
              <button type="button" className="social-ready-strip" onClick={() => setScreen('baskets')}>
                <div><ShoppingBasket /><span><small>Cestas prontas agora</small><strong>{readyBaskets}</strong></span></div><ChevronRight />
              </button>

              <section className="social-desktop-activity">
                <div className="social-desktop-section-head">
                  <div><span>ATIVIDADE</span><h2>Movimentações recentes</h2></div>
                  <button type="button" onClick={() => setScreen('history')}>Ver histórico <ChevronRight /></button>
                </div>
                <div className="social-desktop-activity-list">
                  {activities.slice(0, 5).map((activity) => (
                    <article key={activity.id}>
                      <div className={`social-desktop-activity-icon ${activity.tone}`}>
                        {activity.type === 'donation' ? <Gift /> : activity.type === 'delivery' ? <HeartHandshake /> : activity.type === 'assembly' ? <ShoppingBasket /> : <SlidersHorizontal />}
                      </div>
                      <div><strong>{activity.title}</strong><span>{activity.detail}</span></div>
                      <time>{formatDate(activity.createdAt)}</time>
                    </article>
                  ))}
                  {!activities.length && <div className="social-desktop-activity-empty">As próximas movimentações aparecerão aqui.</div>}
                </div>
              </section>
            </section>
          </div>
        )}

        {screen === 'stock' && (
          <section className="social-screen">
            <section className="social-stock-basket-summary">
              <div className="social-stock-basket-copy">
                <span>CESTAS</span>
                <strong>Transformar estoque em cestas prontas</strong>
                <small>A composição da cesta é definida em Produtos. Aqui você apenas monta as cestas físicas.</small>
              </div>
              <div className="social-stock-basket-numbers">
                <div><span>Podemos montar</span><strong>{capacity}</strong></div>
                <div><span>Cestas prontas</span><strong>{readyBaskets}</strong></div>
              </div>
              <button type="button" disabled={capacity < 1} onClick={() => { setPrepareQty(1); setPrepareBasketOpen(true); }}><ShoppingBasket />Montar cestas</button>
            </section>
            <div className="social-search"><Search /><input value={stockQuery} onChange={(event) => setStockQuery(event.target.value)} placeholder="Buscar item no estoque" /></div>
            <div className="social-filter-pills">
              <button type="button" className={stockFilter === 'all' ? 'active' : ''} onClick={() => setStockFilter('all')}>Todos</button>
              <button type="button" className={stockFilter === 'low' ? 'active' : ''} onClick={() => setStockFilter('low')}>Baixo</button>
              <button type="button" className={stockFilter === 'expiring' ? 'active' : ''} onClick={() => setStockFilter('expiring')}>Vencendo</button>
            </div>

            <div className="social-stock-list">
              {filteredStock.slice(0, stockVisible).map((product) => {
                const quantity = quantityFor(product.id, batches);
                const state = stockState(product, batches);
                const expiry = nextExpiry(product.id, batches);
                return (
                  <article className="social-stock-card" key={product.id}>
                    <div className="social-product-art">{categoryIcon(product)}</div>
                    <div className="social-stock-copy">
                      <h3>{productTitle(product)}</h3>
                      <div className="social-stock-meta">
                        <span className={`social-stock-status ${state.tone}`}><i />{state.label}</span>
                        <small>Próx. validade: {formatMonthYear(expiry)}</small>
                      </div>
                    </div>
                    <div className={`social-stock-balance ${quantity === 0 ? 'is-zero' : ''}`} aria-label={`Saldo atual: ${quantity} ${product.unit_label}`}>
                      <span>Saldo</span>
                      <strong>{quantity}</strong>
                      <small>{product.unit_label}</small>
                    </div>
                    <button type="button" className="social-stock-adjust" onClick={() => { setAdjustProduct(product); setAdjustDirection('add'); setAdjustDelta(1); setAdjustReason(''); setAdjustExpiry(''); }} aria-label={`Ajustar ${productTitle(product)}`}><SlidersHorizontal /></button>
                  </article>
                );
              })}
            </div>
            {!filteredStock.length && <div className="social-empty"><Package /><strong>Nenhum item encontrado</strong><span>Tente outro filtro ou cadastre um produto.</span></div>}
            {filteredStock.length > stockVisible && <button type="button" className="social-more-results" onClick={() => setStockVisible((value) => value + 12)}>Mostrar mais itens</button>}
          </section>
        )}

        {screen === 'donation' && (
          <section className="social-screen social-donation-screen">
            <div className="social-help-banner"><Gift /><div><strong>O que chegou?</strong><span>Toque no produto. A quantidade e a validade abrem em uma janela rápida, sem precisar descer a tela.</span></div></div>
            <div className="social-search"><Search /><input value={donationSearch} onChange={(event) => setDonationSearch(event.target.value)} placeholder="Buscar item" /></div>
            <div className="social-product-grid">
              {donationProducts.map((product) => (
                <button type="button" key={product.id} onClick={() => selectDonationProduct(product.id)}>
                  <span>{categoryIcon(product)}</span><strong>{product.name}</strong><small>{product.package_label}</small>
                </button>
              ))}
              <button type="button" onClick={() => setProductModal({ name: '', packageLabel: '', unitLabel: 'unidades', category: 'outros', minStock: '0', tracksExpiry: false })}>
                <span><Plus /></span><strong>Outro item</strong><small>Cadastrar</small>
              </button>
            </div>

            {donationDraft.length > 0 && (
              <button type="button" className="social-donation-review-bar" onClick={() => setDonationReviewOpen(true)}>
                <span><Gift /><strong>Revisar doação</strong><small>{donationDraft.length} item(ns) adicionados</small></span>
                <span className="social-donation-review-count">{donationDraft.reduce((sum, item) => sum + item.quantity, 0)}</span>
                <ChevronRight />
              </button>
            )}
          </section>
        )}

        {screen === 'baskets' && (
          <section className="social-screen social-deliveries-screen">
            <section className="social-delivery-simple-card">
              <div className="social-delivery-step-head">
                <span>1</span>
                <div><small>FAMÍLIA</small><h2>Quem será atendido?</h2></div>
              </div>

              <label className="social-field">
                <span>Família</span>
                <select value={deliveryFamilyId} onChange={(event) => setDeliveryFamilyId(event.target.value)}>
                  <option value="">Selecione uma família</option>
                  {families.filter((family) => family.is_active).map((family) => <option key={family.id} value={family.id}>{family.responsible_name} · {family.household_size} pessoa(s)</option>)}
                </select>
              </label>

              {deliveryFamilyId && (() => {
                const family = familyMap.get(deliveryFamilyId);
                const familyDeliveries = deliveries
                  .filter((delivery) => delivery.family_id === deliveryFamilyId)
                  .sort((a, b) => b.delivered_on.localeCompare(a.delivered_on) || b.created_at.localeCompare(a.created_at));
                const last = familyDeliveries[0];
                const days = last ? daysSinceDate(last.delivered_on) : Number.POSITIVE_INFINITY;
                const recent = Boolean(last && days >= 0 && days <= 15);
                if (!family) return null;

                return (
                  <div className="social-selected-family">
                    <div className="social-family-preview">
                      <span className="social-avatar">{initials(family.responsible_name)}</span>
                      <div>
                        <strong>{family.responsible_name}</strong>
                        <small>{family.household_size} pessoas · {family.neighborhood || 'Bairro não informado'}</small>
                        <small>{familyDeliveries.length ? `${familyDeliveries.length} atendimento(s) registrado(s)` : 'Nenhum atendimento anterior'}</small>
                      </div>
                    </div>

                    {last && (
                      <div className="social-family-history-summary">
                        <History />
                        <div><span>Último atendimento</span><strong>{formatDate(last.delivered_on)} · {deliveryTypeLabel(last)}</strong></div>
                      </div>
                    )}

                    {recent && last && (
                      <div className="social-recent-delivery-warning">
                        <AlertTriangle />
                        <div>
                          <strong>Atendimento dentro dos últimos 15 dias</strong>
                          <p>Esta família recebeu <b>{deliveryTypeLabel(last)}</b> em <b>{formatDate(last.delivered_on)}</b>{days === 0 ? ' (hoje)' : ` (há ${days} dia(s))`}. O aviso permanece até {alertUntilDate(last.delivered_on)}.</p>
                          <label><input type="checkbox" checked={confirmRecentDelivery} onChange={(event) => setConfirmRecentDelivery(event.target.checked)} /><span>Estou ciente e quero registrar outra entrega.</span></label>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </section>

            {deliveryFamilyId && (
              <section className="social-delivery-simple-card">
                <div className="social-delivery-step-head">
                  <span>2</span>
                  <div><small>TIPO DE ENTREGA</small><h2>O que a família vai levar?</h2></div>
                </div>

                <div className="social-delivery-choice-grid">
                  <button type="button" className={deliveryMode === 'basket' ? 'active' : ''} onClick={() => setDeliveryMode('basket')}>
                    <ShoppingBasket />
                    <div><strong>1 cesta pronta</strong><small>{readyBaskets > 0 ? `${readyBaskets} disponível(is)` : 'Nenhuma cesta pronta'}</small></div>
                    {deliveryMode === 'basket' && <CheckCircle2 />}
                  </button>
                  <button type="button" className={deliveryMode === 'avulsa' ? 'active' : ''} onClick={() => setDeliveryMode('avulsa')}>
                    <Package />
                    <div><strong>Entrega avulsa</strong><small>Escolher itens do estoque</small></div>
                    {deliveryMode === 'avulsa' && <CheckCircle2 />}
                  </button>
                </div>

                {deliveryMode === 'basket' ? (
                  <div className="social-ready-delivery-summary">
                    <ShoppingBasket />
                    <div>
                      <span>Será registrada</span>
                      <strong>1 cesta pronta</strong>
                      <small>{readyBaskets > 0 ? `Restarão ${Math.max(0, readyBaskets - 1)} cesta(s) pronta(s)` : 'Monte uma cesta no Estoque antes de entregar.'}</small>
                    </div>
                  </div>
                ) : (
                  <div className="social-direct-delivery">
                    <div className="social-direct-delivery-head"><div><span>ITENS AVULSOS</span><strong>Selecione somente o que será entregue</strong></div><small>Baixa direta do estoque</small></div>
                    <div className="social-direct-items">
                      {activeProducts.filter((product) => quantityFor(product.id, batches) > 0).map((product) => {
                        const available = quantityFor(product.id, batches);
                        const selected = directDeliveryDraft[product.id] || 0;
                        return (
                          <div className="social-direct-item" key={product.id}>
                            <div className="social-product-art mini">{categoryIcon(product)}</div>
                            <div><strong>{productTitle(product)}</strong><small>Saldo: {available} {product.unit_label}</small></div>
                            <QuantityStepper value={selected} onChange={(value) => setDirectDeliveryDraft((current) => ({ ...current, [product.id]: value }))} min={0} max={available} />
                          </div>
                        );
                      })}
                    </div>
                    {!activeProducts.some((product) => quantityFor(product.id, batches) > 0) && <div className="social-warning-note"><AlertTriangle />Não há itens disponíveis no estoque para uma entrega avulsa.</div>}
                  </div>
                )}

                <label className="social-field"><span>Observação <small>(opcional)</small></span><input value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} placeholder={deliveryMode === 'basket' ? 'Ex.: retirada na igreja' : 'Ex.: atendimento emergencial'} /></label>

                {deliveryMode === 'basket' ? (
                  <button type="button" className="social-primary-action" disabled={saving || readyBaskets < 1 || Boolean((() => { const last = lastDeliveryByFamily.get(deliveryFamilyId); const days = last ? daysSinceDate(last.delivered_on) : 99; return last && days >= 0 && days <= 15 && !confirmRecentDelivery; })())} onClick={() => void deliverBaskets()}><Check />Confirmar entrega de 1 cesta</button>
                ) : (
                  <button type="button" className="social-primary-action" disabled={saving || !Object.values(directDeliveryDraft).some((quantity) => quantity > 0) || Boolean((() => { const last = lastDeliveryByFamily.get(deliveryFamilyId); const days = last ? daysSinceDate(last.delivered_on) : 99; return last && days >= 0 && days <= 15 && !confirmRecentDelivery; })())} onClick={() => void deliverDirectItems()}><Check />Confirmar entrega avulsa</button>
                )}
              </section>
            )}

            {!deliveryFamilyId && <div className="social-delivery-empty-hint"><Users /><strong>Comece selecionando a família</strong><span>O histórico dela aparecerá antes de você escolher o tipo de entrega.</span></div>}
          </section>
        )}

        {screen === 'families' && (
          <section className="social-screen">
            <div className="social-toolbar"><div className="social-search"><Search /><input value={familyQuery} onChange={(event) => setFamilyQuery(event.target.value)} placeholder="Buscar família" /></div><button type="button" className="social-icon-action" onClick={() => setFamilyModal({ responsibleName: '', phone: '', neighborhood: '', householdSize: '1', notes: '' })}><Plus /><span>Nova</span></button></div>
            <div className="social-family-list">
              {filteredFamilies.slice(0, familyVisible).map((family) => {
                const last = lastDeliveryByFamily.get(family.id);
                const days = last ? daysSinceDate(last.delivered_on) : Number.POSITIVE_INFINITY;
                const recent = Boolean(last && days >= 0 && days <= 15);
                const basketCount = activeDeliveries.filter((delivery) => delivery.family_id === family.id && delivery.delivery_type === 'basket').reduce((sum, delivery) => sum + Number(delivery.quantity_baskets || 0), 0);
                const directCount = activeDeliveries.filter((delivery) => delivery.family_id === family.id && delivery.delivery_type === 'avulsa').length;
                return (
                  <article className="social-family-card" key={family.id}>
                    <span className="social-avatar">{initials(family.responsible_name)}</span>
                    <div>
                      <h3>{family.responsible_name}</h3>
                      <p>{family.household_size} pessoa(s) · {family.neighborhood || 'Bairro não informado'}</p>
                      <small>{formatPhoneBR(family.phone, 'Sem telefone')} · Cestas: {basketCount}{directCount ? ` · Avulsas: ${directCount}` : ''}</small>
                      {recent && last && <span className="social-family-recent-badge"><AlertTriangle />Atendimento recente · {days === 0 ? 'hoje' : `há ${days} dia(s)`} · {formatDate(last.delivered_on)}</span>}
                    </div>
                    <button type="button" onClick={() => setFamilyModal({ id: family.id, responsibleName: family.responsible_name, phone: formatPhoneBR(family.phone, ''), neighborhood: family.neighborhood || '', householdSize: String(family.household_size), notes: family.notes || '' })} aria-label="Editar família"><Pencil /></button>
                    <button type="button" className="social-family-deliver" onClick={() => { setDeliveryFamilyId(family.id); setDeliveryMode('basket'); setScreen('baskets'); }}>Registrar entrega</button>
                  </article>
                );
              })}
            </div>
            {!filteredFamilies.length && <div className="social-empty"><Users /><strong>Nenhuma família cadastrada</strong><span>Cadastre a primeira família para registrar entregas.</span><button type="button" onClick={() => setFamilyModal({ responsibleName: '', phone: '', neighborhood: '', householdSize: '1', notes: '' })}><Plus />Cadastrar família</button></div>}
            {filteredFamilies.length > familyVisible && <button type="button" className="social-more-results" onClick={() => setFamilyVisible((value) => value + 10)}>Mostrar mais famílias</button>}
          </section>
        )}

        {screen === 'history' && (
          <section className="social-screen">
            <div className="social-help-banner compact"><History /><div><strong>Histórico protegido</strong><span>Nada é apagado. Quando algo foi lançado por engano, use Estornar: o sistema desfaz o efeito e preserva quem fez, quando fez e o motivo.</span></div></div>
            <div className="social-history-list">
              {activities.slice(0, historyVisible).map((activity) => {
                const reversal = reversalMap.get(`${activity.entityType}:${activity.entityId}`);
                return (
                  <article key={activity.id} className={`social-history-card ${activity.tone} ${reversal ? 'reversed' : ''}`}>
                    <div className="social-history-icon">{activity.type === 'donation' ? <Gift /> : activity.type === 'delivery' ? <HeartHandshake /> : activity.type === 'assembly' ? <ShoppingBasket /> : <SlidersHorizontal />}</div>
                    <div className="social-history-content">
                      <div className="social-history-heading">
                        <h3>{activity.title}</h3>
                        {reversal && <span className="social-reversed-badge"><Undo2 />Estornado</span>}
                      </div>
                      <p>{activity.detail}</p>
                      <small>{formatDateTime(activity.createdAt)} · {profileMap.get(activity.actorId) || 'Equipe CEAMI'}</small>
                      {reversal && <div className="social-reversal-info"><strong>Estornado em {formatDateTime(reversal.created_at)}</strong><span>{profileMap.get(reversal.created_by) || 'Equipe CEAMI'} · {reversal.reason}</span></div>}
                    </div>
                    {!reversal && activity.reversible && (
                      <button type="button" className="social-history-reverse" onClick={() => { setReverseTarget(activity); setReverseReason(''); setReverseError(''); }}><Undo2 /><span>Estornar</span></button>
                    )}
                  </article>
                );
              })}
            </div>
            {!activities.length && <div className="social-empty"><History /><strong>Nenhuma movimentação ainda</strong><span>As próximas doações, entregas, cestas e ajustes aparecerão aqui.</span></div>}
            {activities.length > historyVisible && <button type="button" className="social-more-results" onClick={() => setHistoryVisible((value) => value + 15)}>Mostrar histórico anterior</button>}
          </section>
        )}

        {screen === 'products' && (
          <section className="social-screen">
            <section className="social-products-basket-config">
              <div>
                <span>COMPOSIÇÃO DA CESTA</span>
                <h2>{basketTemplate?.name || 'Cesta básica padrão'}</h2>
                <p>Defina aqui o que compõe uma cesta. Essa configuração é usada para calcular quantas cestas podem ser montadas no Estoque.</p>
                <div className="social-template-items">{templateItems.map((item) => { const product = productMap.get(item.product_id); return product ? <small key={item.id}>{item.quantity} × {productTitle(product)}</small> : null; })}</div>
              </div>
              <button type="button" onClick={openBasketConfig}><Settings2 />Editar composição</button>
            </section>
            <div className="social-toolbar"><div><span className="social-eyebrow">CADASTRO</span><h2 className="social-inline-title">Produtos do estoque</h2></div><button type="button" className="social-icon-action" onClick={() => setProductModal({ name: '', packageLabel: '', unitLabel: 'unidades', category: 'alimentos', minStock: '0', tracksExpiry: true })}><Plus /><span>Novo</span></button></div>
            <div className="social-product-admin-list">
              {products.filter((product) => product.is_active).slice(0, productVisible).map((product) => (
                <article key={product.id}><div className="social-product-art small">{categoryIcon(product)}</div><div><h3>{productTitle(product)}</h3><p>{CATEGORY_LABEL[product.category]} · mínimo {product.min_stock} {product.unit_label}</p><small>{product.tracks_expiry ? 'Controla validade' : 'Sem controle de validade'}</small></div><button type="button" onClick={() => setProductModal({ id: product.id, name: product.name, packageLabel: product.package_label, unitLabel: product.unit_label, category: product.category, minStock: String(product.min_stock), tracksExpiry: product.tracks_expiry })} aria-label="Editar produto"><Pencil /></button></article>
              ))}
            </div>
            {products.filter((product) => product.is_active).length > productVisible && <button type="button" className="social-more-results" onClick={() => setProductVisible((value) => value + 12)}>Mostrar mais produtos</button>}
          </section>
        )}

        {screen === 'more' && (
          <section className="social-screen social-more-screen">
            <div className="social-more-profile"><div className="social-avatar large">{initials(profile?.full_name || 'CEAMI')}</div><div><span>VOCÊ ESTÁ CONECTADO COMO</span><h2>{profile?.full_name || 'Equipe CEAMI Social'}</h2><p>CEAMI Social · acesso autorizado</p></div></div>
            <div className="social-menu-list">
              <button type="button" onClick={() => setScreen('history')}><History /><span><strong>Histórico</strong><small>Veja tudo que entrou, saiu ou foi corrigido.</small></span><ChevronRight /></button>
              <button type="button" onClick={() => setScreen('products')}><Package /><span><strong>Produtos</strong><small>Cadastre itens e defina estoque mínimo.</small></span><ChevronRight /></button>
              <button type="button" onClick={() => void refreshData()}><RefreshCw /><span><strong>Atualizar dados</strong><small>Busca as informações mais recentes do estoque.</small></span><ChevronRight /></button>
            </div>
            <button type="button" className="social-signout" onClick={() => void signOut()}><LogOut />Sair da CEAMI</button>
          </section>
        )}
      </div>

      <nav className="social-bottom-nav" aria-label="Navegação do CEAMI Social">
        <button type="button" className={screen === 'home' ? 'active' : ''} onClick={() => setScreen('home')}><Home /><span>Início</span></button>
        <button type="button" className={screen === 'stock' ? 'active' : ''} onClick={() => setScreen('stock')}><Package /><span>Estoque</span></button>
        <button type="button" className={screen === 'baskets' ? 'active' : ''} onClick={() => setScreen('baskets')}><HeartHandshake /><span>Entregas</span></button>
        <button type="button" className={screen === 'families' ? 'active' : ''} onClick={() => setScreen('families')}><Users /><span>Famílias</span></button>
        <button type="button" className={['more', 'history', 'products'].includes(screen) ? 'active' : ''} onClick={() => setScreen('more')}><MoreHorizontal /><span>Mais</span></button>
      </nav>

      {selectedDonationProductId && (() => {
        const product = productMap.get(selectedDonationProductId);
        if (!product) return null;
        return (
          <Modal title={productTitle(product)} subtitle="Informe a quantidade recebida e, se souber, a validade." onClose={() => setSelectedDonationProductId('')}>
            <div className="social-donation-modal-product">
              <div className="social-product-art">{categoryIcon(product)}</div>
              <div><span>ITEM SELECIONADO</span><strong>{productTitle(product)}</strong><small>{product.unit_label}</small></div>
            </div>
            <label className="social-field"><span>Quantidade</span><div className="social-quantity-row"><QuantityStepper value={donationQty} onChange={setDonationQty} /><div className="social-quick-qty"><button type="button" onClick={() => setDonationQty((value) => value + 1)}>+1</button><button type="button" onClick={() => setDonationQty((value) => value + 5)}>+5</button><button type="button" onClick={() => setDonationQty((value) => value + 10)}>+10</button></div></div></label>
            {product.tracks_expiry && <label className="social-field"><span>Validade <small>(opcional)</small></span><input type="month" value={donationExpiry.slice(0, 7)} onChange={(event) => setDonationExpiry(event.target.value ? `${event.target.value}-01` : '')} /></label>}
            <button type="button" className="social-primary-action" onClick={addDonationItem}><Plus />Adicionar à doação</button>
          </Modal>
        );
      })()}

      {donationReviewOpen && donationDraft.length > 0 && (
        <Modal title="Revisar doação" subtitle="Confira os itens antes de confirmar a entrada no estoque." onClose={() => setDonationReviewOpen(false)}>
          <div className="social-review-list">
            {donationDraft.map((item, index) => {
              const product = productMap.get(item.productId);
              return <div key={`${item.productId}-${item.expiresOn}-${index}`}><span><strong>{product ? productTitle(product) : 'Produto'}</strong><small>{item.quantity} {product?.unit_label || 'unidades'}{item.expiresOn ? ` · val. ${formatMonthYear(item.expiresOn)}` : ''}</small></span><button type="button" onClick={() => setDonationDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remover item"><X /></button></div>;
            })}
          </div>
          <div className="social-form-grid">
            <label className="social-field"><span>Doador <small>(opcional)</small></span><input value={donorName} onChange={(event) => setDonorName(event.target.value)} placeholder="Nome da pessoa ou grupo" /></label>
            <label className="social-field"><span>Observação <small>(opcional)</small></span><input value={donationNote} onChange={(event) => setDonationNote(event.target.value)} placeholder="Ex.: doações do culto" /></label>
          </div>
          <button type="button" className="social-primary-action" disabled={saving} onClick={() => void confirmDonation()}><Check />{saving ? 'Registrando...' : 'Confirmar entrada'}</button>
        </Modal>
      )}

      {reverseTarget && (
        <Modal title="Estornar movimentação?" subtitle="O registro original continuará no histórico. O sistema fará apenas o movimento inverso." onClose={() => { setReverseTarget(null); setReverseReason(''); setReverseError(''); }}>
          <div className="social-reversal-target">
            <div className="social-history-icon">{reverseTarget.type === 'donation' ? <Gift /> : reverseTarget.type === 'delivery' ? <HeartHandshake /> : reverseTarget.type === 'assembly' ? <ShoppingBasket /> : <SlidersHorizontal />}</div>
            <div><strong>{reverseTarget.title}</strong><span>{reverseTarget.detail}</span><small>{formatDateTime(reverseTarget.createdAt)}</small></div>
          </div>
          <div className="social-reversal-warning"><AlertTriangle /><div><strong>Esta ação altera os saldos atuais</strong><p>O sistema só conclui o estorno quando consegue devolver o estoque ou a cesta com segurança. Registros antigos sem rastreio suficiente serão bloqueados.</p></div></div>
          <label className="social-field"><span>Motivo do estorno</span><textarea autoFocus value={reverseReason} onChange={(event) => { setReverseReason(event.target.value); setReverseError(''); }} placeholder="Ex.: entrega registrada duas vezes por engano" /></label>
          {reverseError && <p className="social-reversal-error">{reverseError}</p>}
          <div className="social-modal-actions">
            <button type="button" onClick={() => { setReverseTarget(null); setReverseReason(''); setReverseError(''); }}>Cancelar</button>
            <button type="button" className="danger" disabled={saving || reverseReason.trim().length < 3} onClick={() => void reverseActivity()}><Undo2 />{saving ? 'Estornando...' : 'Confirmar estorno'}</button>
          </div>
        </Modal>
      )}

      {familyDeleteTarget && (
        <Modal title="Excluir família?" subtitle="Essa ação é permanente para cadastros sem histórico de entrega." onClose={() => setFamilyDeleteTarget(null)}>
          <div className="social-delete-warning">
            <Trash2 />
            <div><strong>{familyDeleteTarget.responsible_name}</strong><p>Se essa família já tiver recebido cesta, o sistema não permitirá a exclusão para preservar o histórico.</p></div>
          </div>
          <div className="social-modal-actions">
            <button type="button" onClick={() => setFamilyDeleteTarget(null)}>Cancelar</button>
            <button type="button" className="danger" disabled={saving} onClick={() => void deleteFamily(familyDeleteTarget)}><Trash2 />{saving ? 'Excluindo...' : 'Excluir definitivamente'}</button>
          </div>
        </Modal>
      )}

      {productModal && (
        <Modal title={productModal.id ? 'Editar produto' : 'Novo produto'} subtitle="Cadastre uma vez. Depois a equipe só precisa tocar no item para movimentar o estoque." onClose={() => setProductModal(null)}>
          <div className="social-form-grid">
            <label className="social-field"><span>Produto</span><input autoFocus value={productModal.name} onChange={(event) => setProductModal({ ...productModal, name: event.target.value })} placeholder="Ex.: Arroz" /></label>
            <label className="social-field"><span>Embalagem</span><input value={productModal.packageLabel} onChange={(event) => setProductModal({ ...productModal, packageLabel: event.target.value })} placeholder="Ex.: 5 kg" /></label>
            <label className="social-field"><span>Unidade exibida</span><input value={productModal.unitLabel} onChange={(event) => setProductModal({ ...productModal, unitLabel: event.target.value })} placeholder="Ex.: pacotes" /></label>
            <label className="social-field"><span>Categoria</span><select value={productModal.category} onChange={(event) => setProductModal({ ...productModal, category: event.target.value as Category })}>{Object.entries(CATEGORY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="social-field"><span>Estoque mínimo</span><input inputMode="numeric" value={productModal.minStock} onChange={(event) => setProductModal({ ...productModal, minStock: event.target.value.replace(/\D/g, '') })} /></label>
            <label className="social-check-row"><input type="checkbox" checked={productModal.tracksExpiry} onChange={(event) => setProductModal({ ...productModal, tracksExpiry: event.target.checked })} /><span><strong>Controlar validade</strong><small>Use para alimentos e itens que vencem.</small></span></label>
          </div>
          <div className="social-modal-actions">{productModal.id && <button type="button" className="danger-soft" onClick={() => { const product = products.find((item) => item.id === productModal.id); if (product) void archiveProduct(product); setProductModal(null); }}><Archive />Arquivar</button>}<button type="button" className="primary" disabled={saving || !productModal.name.trim()} onClick={() => void saveProduct()}><Save />{saving ? 'Salvando...' : 'Salvar produto'}</button></div>
        </Modal>
      )}

      {familyModal && (
        <Modal title={familyModal.id ? 'Editar família' : 'Nova família'} subtitle="Guarde somente os dados necessários para organizar as entregas." onClose={() => setFamilyModal(null)}>
          <div className="social-form-grid">
            <label className="social-field"><span>Responsável</span><input autoFocus value={familyModal.responsibleName} onChange={(event) => setFamilyModal({ ...familyModal, responsibleName: event.target.value })} placeholder="Nome completo" /></label>
            <label className="social-field"><span>Telefone <small>(opcional)</small></span><input inputMode="tel" autoComplete="tel" maxLength={15} value={familyModal.phone} onChange={(event) => setFamilyModal({ ...familyModal, phone: formatPhoneInput(event.target.value) })} placeholder="(51) 99999-9999" /><small className="social-field-help">Somente números com DDD.</small></label>
            <label className="social-field"><span>Bairro / cidade</span><input value={familyModal.neighborhood} onChange={(event) => setFamilyModal({ ...familyModal, neighborhood: event.target.value })} placeholder="Ex.: Centro — Sapucaia do Sul" /></label>
            <label className="social-field"><span>Pessoas na residência</span><input inputMode="numeric" value={familyModal.householdSize} onChange={(event) => setFamilyModal({ ...familyModal, householdSize: event.target.value.replace(/\D/g, '') })} /></label>
            <label className="social-field"><span>Observação <small>(opcional)</small></span><textarea value={familyModal.notes} onChange={(event) => setFamilyModal({ ...familyModal, notes: event.target.value })} placeholder="Informações úteis para a equipe" /></label>
          </div>
          <div className="social-modal-actions">{familyModal.id && <button type="button" className="danger-soft" onClick={() => { const family = families.find((item) => item.id === familyModal.id); if (family) { setFamilyModal(null); setFamilyDeleteTarget(family); } }}><Trash2 />Excluir</button>}<button type="button" className="primary" disabled={saving || !familyModal.responsibleName.trim()} onClick={() => void saveFamily()}><Save />{saving ? 'Salvando...' : 'Salvar família'}</button></div>
        </Modal>
      )}

      {adjustProduct && (
        <Modal title={`Ajustar ${productTitle(adjustProduct)}`} subtitle="O ajuste não apaga o histórico. O motivo fica registrado para conferência." onClose={() => setAdjustProduct(null)}>
          <div className="social-segmented"><button type="button" className={adjustDirection === 'add' ? 'active' : ''} onClick={() => setAdjustDirection('add')}><Plus />Adicionar</button><button type="button" className={adjustDirection === 'remove' ? 'active' : ''} onClick={() => setAdjustDirection('remove')}><Minus />Retirar</button></div>
          <div className="social-adjust-current"><span>Estoque atual</span><strong>{quantityFor(adjustProduct.id, batches)} {adjustProduct.unit_label}</strong></div>
          <label className="social-field"><span>Quantidade</span><QuantityStepper value={adjustDelta} onChange={setAdjustDelta} min={1} max={9999} /></label>
          {adjustDirection === 'add' && adjustProduct.tracks_expiry && <label className="social-field"><span>Validade <small>(opcional)</small></span><input type="month" value={adjustExpiry.slice(0, 7)} onChange={(event) => setAdjustExpiry(event.target.value ? `${event.target.value}-01` : '')} /></label>}
          <label className="social-field"><span>Motivo do ajuste</span><input value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} placeholder="Ex.: erro de contagem, item danificado..." /></label>
          <button type="button" className="social-primary-action" disabled={saving || !adjustReason.trim()} onClick={() => void confirmAdjustment()}><Check />Confirmar ajuste</button>
        </Modal>
      )}

      {prepareBasketOpen && (
        <Modal title="Montar cestas" subtitle="Os itens serão baixados do estoque e passarão a contar como cestas prontas." onClose={() => setPrepareBasketOpen(false)}>
          <div className="social-prepare-modal-summary">
            <div><span>Podemos montar</span><strong>{capacity}</strong><small>com o estoque atual</small></div>
            <div><span>Já prontas</span><strong>{readyBaskets}</strong><small>aguardando entrega</small></div>
          </div>
          <label className="social-field"><span>Quantidade a montar</span><QuantityStepper value={prepareQty} onChange={setPrepareQty} min={1} max={Math.max(1, capacity)} /></label>
          {capacity > 0 ? <div className="social-success-note"><ShoppingBasket />Você pode montar até <strong>{capacity} cesta(s)</strong> agora.</div> : <div className="social-warning-note"><AlertTriangle />O estoque não possui todos os itens necessários para uma cesta completa.</div>}
          <button type="button" className="social-primary-action" disabled={saving || capacity < 1 || prepareQty > capacity} onClick={() => void prepareBaskets()}><Check />{saving ? 'Montando...' : `Confirmar ${prepareQty} cesta(s)`}</button>
        </Modal>
      )}

      {basketConfigOpen && (
        <Modal title="Configurar cesta básica" subtitle="Defina quantas unidades de cada produto entram em uma cesta padrão." onClose={() => setBasketConfigOpen(false)}>
          <div className="social-basket-config-list">
            {activeProducts.map((product) => <div key={product.id}><div className="social-product-art mini">{categoryIcon(product)}</div><span><strong>{productTitle(product)}</strong><small>{product.unit_label}</small></span><QuantityStepper value={basketConfig[product.id] || 0} onChange={(value) => setBasketConfig((current) => ({ ...current, [product.id]: value }))} min={0} max={20} /></div>)}
          </div>
          <button type="button" className="social-primary-action" disabled={saving} onClick={() => void saveBasketConfig()}><Save />{saving ? 'Salvando...' : 'Salvar composição'}</button>
        </Modal>
      )}

      {toast && <div className="social-toast" role="status"><CheckCircle2 />{toast}</div>}
    </main>
  );
}
