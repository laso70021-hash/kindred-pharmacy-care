export type UserRole =
  | 'super_admin'
  | 'pharmacy_owner'
  | 'pharmacist'
  | 'cashier'
  | 'manager'
  | 'accountant'
  | 'supplier'
  | 'delivery_rider'
  | 'inventory_manager';

export type PharmacyStatus = 'active' | 'pending' | 'suspended' | 'trial' | 'expired';

export interface SubscriptionPlan {
  id: string;
  slug: string;
  name: string;
  price_tzs_monthly: number;
  price_tzs_annual: number;
  max_branches: number;
  max_employees: number;
  has_ai_insights: boolean;
  has_prescription_stt_ttt: boolean;
  has_advanced_ai_forecasting: boolean;
  has_bulk_import_ocr: boolean;
  has_delivery_management: boolean;
  support_tier: string;
  features: string[];
}

export interface Pharmacy {
  id: string;
  name: string;
  registration_number?: string;
  tax_number?: string;
  owner_name: string;
  owner_email: string;
  plan: 'Standard' | 'Professional' | 'Enterprise' | 'Trial' | 'Expired';
  plan_slug: string;
  registered_at: string;
  status: 'Active' | 'Pending' | 'Suspended';
  sales_total: number;
  branches_count: number;
  employees_count: number;
  city: string;
  phone: string;
  address?: string;
}

export interface Branch {
  id: string;
  pharmacy_id: string;
  pharmacy_name?: string;
  name: string;
  code?: string;
  address?: string;
  phone?: string;
  manager_id?: string;
  manager_name?: string;
  is_main: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Customer {
  id: string;
  pharmacy_id?: string;
  pharmacy_name?: string;
  full_name: string;
  phone?: string;
  email?: string;
  address?: string;
  allergies?: string;
  chronic_conditions?: string;
  purchases_count?: number;
  total_spent?: number;
  created_at: string;
}

export interface ProductItem {
  id: string;
  pharmacy_id?: string;
  pharmacy_name?: string;
  name: string;
  generic_name: string;
  category: string;
  dosage: string;
  sku: string;
  barcode?: string;
  units_sold: number;
  total_sales: number;
  stock_quantity: number;
  min_stock: number;
  cost_price: number;
  selling_price: number;
  is_prescription_required?: boolean;
  is_active?: boolean;
  expiry_date?: string;
}

export interface InventoryBatch {
  id: string;
  pharmacy_id: string;
  pharmacy_name?: string;
  branch_id?: string;
  branch_name?: string;
  product_id: string;
  product_name?: string;
  batch_number: string;
  quantity: number;
  cost_per_unit: number;
  expiry_date: string;
  received_date?: string;
  days_to_expiry?: number;
}

export interface Supplier {
  id: string;
  pharmacy_id?: string;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  tax_id?: string;
  is_active: boolean;
  created_at: string;
}

export interface SaleTransaction {
  id: string;
  pharmacy_id: string;
  pharmacy_name?: string;
  branch_id?: string;
  customer_id?: string;
  customer_name?: string;
  invoice_number: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment_status: 'completed' | 'pending' | 'refunded';
  payment_method: 'cash' | 'card' | 'mobile_money';
  created_at: string;
  items_count?: number;
}

export interface PurchaseOrder {
  id: string;
  pharmacy_id: string;
  pharmacy_name?: string;
  supplier_id: string;
  supplier_name?: string;
  order_number: string;
  status: 'draft' | 'ordered' | 'received' | 'cancelled';
  total_amount: number;
  order_date: string;
  expected_delivery_date?: string;
  received_date?: string;
  created_at: string;
}

export interface ExpenseRecord {
  id: string;
  pharmacy_id: string;
  pharmacy_name?: string;
  category: string;
  amount: number;
  description?: string;
  expense_date: string;
  recorded_by?: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
  avatar_url?: string;
  system_role: UserRole;
  is_super_admin: boolean;
  pharmacy_id?: string;
  pharmacy_name?: string;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  pharmacy_id?: string;
  pharmacy_name?: string;
  ticket_number: string;
  subject: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
}

export interface AIFeatureState {
  id: string;
  slug: string;
  name: string;
  description: string;
  is_enabled: boolean;
  category?: string;
  icon?: string;
}

export interface AIRecommendationItem {
  id: string;
  title: string;
  description: string;
  category: 'inventory' | 'expiry' | 'finance' | 'demand' | 'safety';
  severity: 'urgent' | 'action' | 'review' | 'forecast' | 'check';
  badge_label: string;
  badge_color: 'urgent' | 'action' | 'review' | 'forecast' | 'check';
  created_at: string;
  status: 'pending' | 'resolved' | 'dismissed';
}

export interface SystemHealthItem {
  service: string;
  status: 'Operational' | 'Degraded' | 'Down';
  latency: string;
  last_check: string;
}

export interface ActivityLogItem {
  id: string;
  title: string;
  time: string;
  type: 'pharmacy' | 'subscription' | 'user' | 'plan' | 'stock' | 'system';
}

export interface SalesDataPoint {
  date: string;
  sales: number;
  orders: number;
  revenue: number;
}

export type BusinessType = 'pharmacy' | 'supplier';

export interface SubscriptionPayment {
  id: string;
  pharmacy_id: string;
  plan_id: string | null;
  amount_tzs: number;
  method: string;
  reference: string | null;
  receipt_path: string | null;
  status: 'pending' | 'confirmed' | 'rejected';
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface BusinessRegistration {
  id: string;
  name: string;
  business_type: BusinessType;
  owner_id: string | null;
  owner_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  registration_number: string | null;
  tax_number: string | null;
  plan_id: string | null;
  plan_slug: string;
  plan_name: string;
  yearly_price: number;
  billing_choice: 'trial' | 'annual';
  status: string;
  effective_status: import('./billing').AccountStatus;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  approved_at: string | null;
  review_note: string | null;
  created_at: string;
  payments: SubscriptionPayment[];
}

export interface RegistrationInput {
  business_type: BusinessType;
  plan_slug: string;
  billing_choice: 'trial' | 'annual';
  business_name: string;
  owner_name: string;
  phone: string;
  city: string;
  address: string;
  registration_number: string;
  tax_number: string;
  payment_method?: string;
  payment_reference?: string;
}
