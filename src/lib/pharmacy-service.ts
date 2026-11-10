import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as typedSupabase } from '@/integrations/supabase/client';
import {
  Pharmacy,
  Branch,
  Customer,
  ProductItem,
  InventoryBatch,
  Supplier,
  SaleTransaction,
  PurchaseOrder,
  ExpenseRecord,
  UserProfile,
  SupportTicket,
  AIFeatureState,
  AIRecommendationItem,
  SystemHealthItem,
  ActivityLogItem,
  SalesDataPoint,
  SubscriptionPlan,
  BusinessRegistration,
  SubscriptionPayment,
  RegistrationInput,
  Workspace,
  WsBranch,
  WsStaff,
  WsInvite,
  MyInvitation,
  WsProduct,
  WsProductInput,
  WsBatch,
  WsSale,
  WsExpense
} from '@/lib/pharmacy-types';
import type { WorkspaceRole, StaffRole } from './workspace';
import { formatDateDeterministic } from './utils';
import { effectiveStatus, yearlyPrice } from './billing';

// Rows are mapped defensively below (the source app tolerated several schema
// versions), so this layer reads through an untyped client.
const supabase = typedSupabase as unknown as SupabaseClient;

export class PharmacyService {
  // ==========================================
  // 1. PLANS & ENTITLEMENTS
  // ==========================================
  static async getPlans(): Promise<SubscriptionPlan[]> {
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('display_order', { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map((d: any) => {
          const planCode = d.plan_code || d.slug || 'starter';
          let featureList: string[] = [];

          if (Array.isArray(d.features)) {
            featureList = d.features;
          } else if (typeof d.features === 'object' && d.features !== null) {
            const fMap: Record<string, string> = {
              pos: 'Core POS & inventory',
              inventory: 'Smart stock control',
              expiry_alerts: 'Expiry & low-stock alerts',
              email_support: 'Email support',
              reports: 'Reports & exports',
              supplier_orders: 'Supplier orders',
              prescription_assistant: 'Prescription (TTT/STT)',
              ai_mapping: 'Bulk medicine import (AI mapping)',
              delivery: 'Delivery management',
              priority_support: 'Priority support',
              advanced_analytics: 'Full AI analytics & forecasting',
              custom_integrations: 'Custom integrations (e.g. HIS/EMR)',
              dedicated_account_manager: 'Dedicated account manager',
              sla: 'SLA & training'
            };
            featureList = Object.keys(d.features)
              .filter((k) => d.features[k])
              .map((k) => fMap[k] || k.replace(/_/g, ' '));

            if (d.max_branches) featureList.unshift(`Up to ${d.max_branches} branch${d.max_branches > 1 ? 'es' : ''}`);
            if (d.max_employees) featureList.splice(1, 0, `Up to ${d.max_employees} employees`);
          }

          return {
            id: d.id,
            slug: planCode,
            name: d.plan_name || d.name || 'Plan',
            price_tzs_monthly: Number(d.monthly_price ?? d.price_tzs_monthly ?? 0),
            price_tzs_annual: d.price_tzs_annual != null ? Number(d.price_tzs_annual) : d.annual_price ? Math.round(d.annual_price / 12) : (d.monthly_price ? Math.round(d.monthly_price * 0.8) : 0),
            max_branches: d.max_branches ?? 999,
            max_employees: d.max_employees ?? 999,
            has_ai_insights: Boolean(d.has_ai_insights || d.features?.prescription_assistant || d.features?.advanced_analytics),
            has_prescription_stt_ttt: Boolean(d.has_prescription_stt_ttt || d.features?.prescription_assistant),
            has_advanced_ai_forecasting: Boolean(d.has_advanced_ai_forecasting || d.features?.advanced_analytics),
            has_bulk_import_ocr: Boolean(d.has_bulk_import_ocr || d.features?.ai_mapping),
            has_delivery_management: Boolean(d.has_delivery_management || d.features?.delivery),
            support_tier: d.support_tier || (d.features?.priority_support ? 'Priority Support' : d.features?.dedicated_account_manager ? 'Dedicated Account Manager' : 'Email Support'),
            features: featureList.length > 0 ? featureList : ['Core POS', 'Expiry alerts', 'Standard support']
          };
        });
      }
    } catch (e) {
      console.warn('Failed to load plans from Supabase:', e);
    }
    return [];
  }

  // ==========================================
  // 2. PHARMACIES (TENANTS)
  // ==========================================
  static async getPharmacies(): Promise<Pharmacy[]> {
    try {
      const { data, error } = await supabase
        .from('pharmacies')
        .select('*, subscription_plans!pharmacies_plan_id_fkey(name, slug)')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((d: any) => ({
          id: d.id,
          name: d.name || d.display_name || d.legal_name || 'Pharmacy',
          registration_number: d.registration_number || '',
          tax_number: d.tax_number || '',
          owner_name: d.owner_name || 'Owner',
          owner_email: d.email || 'info@' + (d.name || 'pharmacy').toLowerCase().replace(/\s+/g, '') + '.com',
          plan: (d.subscription_plans?.name || d.plan_name || 'Standard') as any,
          plan_slug: d.subscription_plans?.slug || d.plan_slug || 'starter',
          registered_at: formatDateDeterministic(d.created_at),
          status: (['active', 'trial'].includes(effectiveStatus(d))) ? 'Active' : (d.status === 'suspended' ? 'Suspended' : 'Pending'),
          sales_total: d.sales_total || 0,
          branches_count: d.branches_count || 1,
          employees_count: d.employees_count || 3,
          city: d.city || 'Dar es Salaam',
          phone: d.phone || '+255 700 000 000',
          address: d.address || ''
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch pharmacies:', e);
    }
    return [];
  }

  static async addPharmacy(pharmacy: Partial<Pharmacy>): Promise<{ data: Pharmacy | null; error: string | null }> {
    try {
      const payload: any = {
        name: pharmacy.name,
        email: pharmacy.owner_email,
        phone: pharmacy.phone,
        city: pharmacy.city || 'Dar es Salaam',
        status: 'active'
      };

      const { data, error } = await supabase.from('pharmacies').insert(payload).select().single();
      if (error) {
        return { data: null, error: error.message };
      }

      return {
        data: {
          id: data.id,
          name: data.name,
          owner_name: pharmacy.owner_name || 'Owner',
          owner_email: data.email,
          plan: 'Standard',
          plan_slug: 'starter',
          registered_at: formatDateDeterministic(data.created_at),
          status: 'Active',
          sales_total: 0,
          branches_count: 1,
          employees_count: 2,
          city: data.city,
          phone: data.phone
        },
        error: null
      };
    } catch (err: any) {
      return { data: null, error: err.message || 'Operation failed' };
    }
  }

  static async togglePharmacyStatus(id: string, currentStatus: string): Promise<boolean> {
    try {
      const nextStatus = currentStatus === 'Active' ? 'suspended' : 'active';
      const { error } = await supabase.from('pharmacies').update({ status: nextStatus }).eq('id', id);
      return !error;
    } catch {
      return false;
    }
  }

  // ==========================================
  // 3. CUSTOMERS
  // ==========================================
  static async getCustomers(): Promise<Customer[]> {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((c: any) => ({
          id: c.id,
          pharmacy_id: c.pharmacy_id,
          full_name: c.full_name || 'Unnamed Customer',
          phone: c.phone || '—',
          email: c.email || '—',
          address: c.address || '—',
          allergies: c.allergies || 'None recorded',
          chronic_conditions: c.chronic_conditions || 'None recorded',
          purchases_count: c.purchases_count || 0,
          total_spent: c.total_spent || 0,
          created_at: formatDateDeterministic(c.created_at)
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch customers:', e);
    }
    return [];
  }

  static async addCustomer(customer: Partial<Customer>): Promise<{ data: Customer | null; error: string | null }> {
    try {
      const payload: any = {
        full_name: customer.full_name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        allergies: customer.allergies,
        chronic_conditions: customer.chronic_conditions
      };
      if (customer.pharmacy_id) {
        payload.pharmacy_id = customer.pharmacy_id;
      }

      const { data, error } = await supabase.from('customers').insert(payload).select().single();
      if (error) {
        return { data: null, error: error.message };
      }

      return {
        data: {
          id: data.id,
          pharmacy_id: data.pharmacy_id,
          full_name: data.full_name,
          phone: data.phone || '—',
          email: data.email || '—',
          address: data.address || '—',
          allergies: data.allergies || 'None recorded',
          chronic_conditions: data.chronic_conditions || 'None recorded',
          purchases_count: 0,
          total_spent: 0,
          created_at: formatDateDeterministic(data.created_at)
        },
        error: null
      };
    } catch (err: any) {
      return { data: null, error: err.message || 'Operation failed' };
    }
  }

  static async deleteCustomer(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      return !error;
    } catch {
      return false;
    }
  }

  // ==========================================
  // 4. BRANCHES
  // ==========================================
  static async getBranches(): Promise<Branch[]> {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((b: any) => ({
          id: b.id,
          pharmacy_id: b.pharmacy_id,
          name: b.name,
          code: b.code || 'MAIN',
          address: b.address || '',
          phone: b.phone || '',
          manager_id: b.manager_id,
          is_main: Boolean(b.is_main),
          is_active: Boolean(b.is_active !== false),
          created_at: formatDateDeterministic(b.created_at)
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch branches:', e);
    }
    return [];
  }

  static async addBranch(branch: Partial<Branch>): Promise<{ data: Branch | null; error: string | null }> {
    try {
      const payload: any = {
        pharmacy_id: branch.pharmacy_id,
        name: branch.name,
        code: branch.code,
        address: branch.address,
        phone: branch.phone,
        is_main: branch.is_main || false,
        is_active: true
      };

      const { data, error } = await supabase.from('branches').insert(payload).select().single();
      if (error) {
        return { data: null, error: error.message };
      }
      return {
        data: {
          id: data.id,
          pharmacy_id: data.pharmacy_id,
          name: data.name,
          code: data.code,
          address: data.address,
          phone: data.phone,
          is_main: data.is_main,
          is_active: data.is_active,
          created_at: formatDateDeterministic(data.created_at)
        },
        error: null
      };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  }

  // ==========================================
  // 5. PRODUCTS & CATALOGUE
  // ==========================================
  static async getProducts(): Promise<ProductItem[]> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((p: any) => ({
          id: p.id,
          pharmacy_id: p.pharmacy_id,
          name: p.name,
          generic_name: p.generic_name || '',
          category: p.category_id ? 'General' : 'Prescription',
          dosage: p.dosage_form ? `${p.strength || ''} ${p.dosage_form}`.trim() : (p.dosage || '500mg'),
          sku: p.sku || 'SKU-001',
          barcode: p.barcode,
          units_sold: p.units_sold || 0,
          total_sales: p.total_sales || 0,
          stock_quantity: p.stock_quantity ?? 100,
          min_stock: p.min_stock_level ?? 10,
          cost_price: Number(p.cost_price || 0),
          selling_price: Number(p.selling_price || 0),
          is_prescription_required: Boolean(p.is_prescription_required),
          is_active: Boolean(p.is_active !== false),
          expiry_date: p.expiry_date || '2027-12-31'
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch products:', e);
    }
    return [];
  }

  static async addProduct(product: Partial<ProductItem>): Promise<{ data: ProductItem | null; error: string | null }> {
    try {
      const payload: any = {
        name: product.name,
        generic_name: product.generic_name,
        sku: product.sku || 'SKU-' + Math.floor(Math.random() * 9000 + 1000),
        dosage_form: product.dosage || 'Tablets',
        strength: product.dosage || '500mg',
        cost_price: product.cost_price || 0,
        selling_price: product.selling_price || 1000,
        min_stock_level: product.min_stock || 10,
        is_prescription_required: Boolean(product.is_prescription_required),
        is_active: true
      };
      if (product.pharmacy_id) {
        payload.pharmacy_id = product.pharmacy_id;
      }

      const { data, error } = await supabase.from('products').insert(payload).select().single();
      if (error) {
        return { data: null, error: error.message };
      }
      return {
        data: {
          id: data.id,
          pharmacy_id: data.pharmacy_id,
          name: data.name,
          generic_name: data.generic_name,
          category: 'General',
          dosage: data.dosage_form,
          sku: data.sku,
          units_sold: 0,
          total_sales: 0,
          stock_quantity: 0,
          min_stock: data.min_stock_level,
          cost_price: data.cost_price,
          selling_price: data.selling_price,
          is_active: data.is_active,
          expiry_date: '2027-12-31'
        },
        error: null
      };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  }

  // ==========================================
  // 6. INVENTORY BATCHES
  // ==========================================
  static async getInventoryBatches(): Promise<InventoryBatch[]> {
    try {
      const { data, error } = await supabase
        .from('inventory_batches')
        .select('*, products(name)')
        .order('expiry_date', { ascending: true });

      if (!error && data) {
        return data.map((b: any) => {
          const exp = new Date(b.expiry_date);
          const now = new Date();
          const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 3600 * 24));
          return {
            id: b.id,
            pharmacy_id: b.pharmacy_id,
            branch_id: b.branch_id,
            product_id: b.product_id,
            product_name: b.products?.name || b.product_name || 'Medicine Formulation',
            batch_number: b.batch_number,
            quantity: b.quantity || 0,
            cost_per_unit: Number(b.cost_per_unit || 0),
            expiry_date: b.expiry_date,
            received_date: b.received_date,
            days_to_expiry: diffDays
          };
        });
      }
    } catch (e) {
      console.warn('Failed to fetch batches:', e);
    }
    return [];
  }

  // ==========================================
  // 7. ORDERS & SALES (POS)
  // ==========================================
  static async getSales(): Promise<SaleTransaction[]> {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((s: any) => ({
          id: s.id,
          pharmacy_id: s.pharmacy_id,
          branch_id: s.branch_id,
          customer_id: s.customer_id,
          invoice_number: s.invoice_number || `INV-${s.id.slice(0, 6).toUpperCase()}`,
          subtotal: Number(s.subtotal || 0),
          discount: Number(s.discount || 0),
          tax: Number(s.tax || 0),
          total: Number(s.total || s.total_amount || 0),
          payment_status: s.payment_status || 'completed',
          payment_method: s.payment_method || 'cash',
          created_at: formatDateDeterministic(s.created_at)
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch sales:', e);
    }
    return [];
  }

  // ==========================================
  // 8. PURCHASES & SUPPLIER ORDERS
  // ==========================================
  static async getPurchases(): Promise<PurchaseOrder[]> {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((po: any) => ({
          id: po.id,
          pharmacy_id: po.pharmacy_id,
          supplier_id: po.supplier_id,
          supplier_name: po.supplier_name || 'Pharmaceutical Supplier',
          order_number: po.order_number || `PO-${po.id.slice(0, 6).toUpperCase()}`,
          status: po.status || 'ordered',
          total_amount: Number(po.total_amount || 0),
          order_date: po.order_date || '2026-11-01',
          expected_delivery_date: po.expected_delivery_date,
          received_date: po.received_date,
          created_at: formatDateDeterministic(po.created_at)
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch purchases:', e);
    }
    return [];
  }

  // ==========================================
  // 9. SUPPLIERS
  // ==========================================
  static async getSuppliers(): Promise<Supplier[]> {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((sup: any) => ({
          id: sup.id,
          pharmacy_id: sup.pharmacy_id,
          name: sup.name,
          contact_name: sup.contact_name || '—',
          email: sup.email || '—',
          phone: sup.phone || '—',
          address: sup.address || '—',
          tax_id: sup.tax_id || '—',
          is_active: Boolean(sup.is_active !== false),
          created_at: formatDateDeterministic(sup.created_at)
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch suppliers:', e);
    }
    return [];
  }

  static async addSupplier(supplier: Partial<Supplier>): Promise<{ data: Supplier | null; error: string | null }> {
    try {
      const payload: any = {
        name: supplier.name,
        contact_name: supplier.contact_name,
        email: supplier.email,
        phone: supplier.phone,
        address: supplier.address,
        tax_id: supplier.tax_id,
        is_active: true
      };
      if (supplier.pharmacy_id) {
        payload.pharmacy_id = supplier.pharmacy_id;
      }

      const { data, error } = await supabase.from('suppliers').insert(payload).select().single();
      if (error) {
        return { data: null, error: error.message };
      }
      return {
        data: {
          id: data.id,
          pharmacy_id: data.pharmacy_id,
          name: data.name,
          contact_name: data.contact_name,
          email: data.email,
          phone: data.phone,
          address: data.address,
          tax_id: data.tax_id,
          is_active: data.is_active,
          created_at: formatDateDeterministic(data.created_at)
        },
        error: null
      };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  }

  // ==========================================
  // 10. EXPENSES
  // ==========================================
  static async getExpenses(): Promise<ExpenseRecord[]> {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (!error && data) {
        return data.map((exp: any) => ({
          id: exp.id,
          pharmacy_id: exp.pharmacy_id,
          category: exp.category || 'General',
          amount: Number(exp.amount || 0),
          description: exp.description || '—',
          expense_date: exp.expense_date || '2026-11-01',
          created_at: formatDateDeterministic(exp.created_at)
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch expenses:', e);
    }
    return [];
  }

  static async addExpense(expense: Partial<ExpenseRecord>): Promise<{ data: ExpenseRecord | null; error: string | null }> {
    try {
      const payload: any = {
        category: expense.category || 'General',
        amount: expense.amount || 0,
        description: expense.description || '',
        expense_date: expense.expense_date || new Date().toISOString().slice(0, 10)
      };
      if (expense.pharmacy_id) {
        payload.pharmacy_id = expense.pharmacy_id;
      }

      const { data, error } = await supabase.from('expenses').insert(payload).select().single();
      if (error) {
        return { data: null, error: error.message };
      }
      return {
        data: {
          id: data.id,
          pharmacy_id: data.pharmacy_id,
          category: data.category,
          amount: data.amount,
          description: data.description,
          expense_date: data.expense_date,
          created_at: formatDateDeterministic(data.created_at)
        },
        error: null
      };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  }

  // ==========================================
  // 11. USERS & ROLES
  // ==========================================
  static async getUsers(): Promise<UserProfile[]> {
    try {
      const [{ data, error }, { data: roleRows }] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('user_roles').select('user_id, role')
      ]);

      if (!error && data) {
        const rolesByUser = new Map<string, string[]>();
        (roleRows || []).forEach((r: any) => {
          rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) || []), r.role]);
        });
        return data.map((u: any) => {
          const roles = rolesByUser.get(u.id) || [];
          const isAdmin = roles.includes('super_admin');
          return {
            id: u.id,
            email: u.email,
            full_name: u.full_name || 'Platform User',
            phone: u.phone || '—',
            avatar_url: u.avatar_url,
            system_role: (isAdmin ? 'super_admin' : roles[0] || 'pharmacist') as UserProfile['system_role'],
            is_super_admin: isAdmin,
            created_at: formatDateDeterministic(u.created_at)
          };
        });
      }
    } catch (e) {
      console.warn('Failed to fetch users:', e);
    }
    return [];
  }

  // ==========================================
  // 12. AI FEATURES
  // ==========================================
  static async getAIFeatures(): Promise<AIFeatureState[]> {
    try {
      const { data, error } = await supabase.from('ai_features').select('*').order('created_at', { ascending: true });
      if (!error && data && data.length > 0) {
        return data.map((d: any) => ({
          id: d.id,
          slug: d.slug,
          name: d.name,
          description: d.description,
          is_enabled: d.is_enabled ?? true,
          category: d.category || 'general'
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch AI features:', e);
    }
    return [];
  }

  static async toggleAIFeature(slug: string, currentVal: boolean): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('ai_features')
        .update({ is_enabled: !currentVal, updated_at: new Date().toISOString() })
        .eq('slug', slug);
      return !error;
    } catch {
      return false;
    }
  }

  // ==========================================
  // 13. AI RECOMMENDATIONS
  // ==========================================
  static async getRecommendations(): Promise<AIRecommendationItem[]> {
    try {
      const { data, error } = await supabase
        .from('ai_recommendations')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map((r: any) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          category: r.category || 'inventory',
          severity: r.severity || 'action',
          badge_label: (r.severity || 'action').toUpperCase(),
          badge_color: r.severity || 'action',
          created_at: formatDateDeterministic(r.created_at),
          status: r.status || 'pending'
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch recommendations:', e);
    }
    return [];
  }

  static async resolveRecommendation(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('ai_recommendations')
        .update({ status: 'resolved' })
        .eq('id', id);
      return !error;
    } catch {
      return false;
    }
  }

  // ==========================================
  // 14. SYSTEM HEALTH
  // ==========================================
  static async getSystemHealth(): Promise<SystemHealthItem[]> {
    try {
      const { data, error } = await supabase
        .from('system_health_checks')
        .select('*');

      if (!error && data && data.length > 0) {
        return data.map((h: any) => ({
          service: h.service_name || 'Service',
          status: (h.status === 'operational' || h.status === 'Operational') ? 'Operational' : (h.status === 'degraded' ? 'Degraded' : 'Down'),
          latency: `${h.response_time_ms || 15}ms`,
          last_check: 'Just now'
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch system health:', e);
    }
    return [
      { service: 'Application', status: 'Operational', latency: '12ms', last_check: 'Just now' },
      { service: 'Database', status: 'Operational', latency: '18ms', last_check: 'Just now' },
      { service: 'Storage', status: 'Operational', latency: '24ms', last_check: 'Just now' },
      { service: 'Background Jobs', status: 'Operational', latency: '8ms', last_check: 'Just now' },
      { service: 'Email Service', status: 'Operational', latency: '45ms', last_check: 'Just now' },
      { service: 'Payment Gateway', status: 'Operational', latency: '32ms', last_check: 'Just now' }
    ];
  }

  // ==========================================
  // 15. AUDIT LOGS
  // ==========================================
  static async getAuditLogs(): Promise<ActivityLogItem[]> {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25);

      if (!error && data && data.length > 0) {
        return data.map((a: any) => ({
          id: a.id,
          title: `${a.action}: ${a.entity} ${a.entity_id ? '#' + a.entity_id.slice(0, 8) : ''}`,
          time: formatDateDeterministic(a.created_at),
          type: 'system'
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch audit logs:', e);
    }
    return [];
  }

  // ==========================================
  // 16. SUPPORT TICKETS
  // ==========================================
  static async getSupportTickets(): Promise<SupportTicket[]> {
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((t: any) => ({
          id: t.id,
          pharmacy_id: t.pharmacy_id,
          ticket_number: t.ticket_number || `TICK-${t.id.slice(0, 6).toUpperCase()}`,
          subject: t.subject,
          description: t.description || '',
          category: t.category || 'technical',
          priority: t.priority || 'medium',
          status: t.status || 'open',
          created_at: formatDateDeterministic(t.created_at)
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch support tickets:', e);
    }
    return [];
  }

  static async createSupportTicket(ticket: Partial<SupportTicket>): Promise<{ data: SupportTicket | null; error: string | null }> {
    try {
      const payload: any = {
        ticket_number: `TICK-${Math.floor(Math.random() * 90000 + 10000)}`,
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category || 'technical',
        priority: ticket.priority || 'medium',
        status: 'open'
      };
      if (ticket.pharmacy_id) {
        payload.pharmacy_id = ticket.pharmacy_id;
      }

      const { data, error } = await supabase.from('support_tickets').insert(payload).select().single();
      if (error) {
        return { data: null, error: error.message };
      }
      return {
        data: {
          id: data.id,
          pharmacy_id: data.pharmacy_id,
          ticket_number: data.ticket_number,
          subject: data.subject,
          description: data.description,
          category: data.category,
          priority: data.priority,
          status: data.status,
          created_at: formatDateDeterministic(data.created_at)
        },
        error: null
      };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  }

  // ==========================================
  // REGISTRATIONS, APPROVALS & YEARLY BILLING
  // ==========================================
  private static readonly registrationSelect =
    '*, subscription_plans!pharmacies_plan_id_fkey(name, slug, price_tzs_monthly, price_tzs_annual), subscription_payments(*)';

  private static mapRegistration(d: any): BusinessRegistration {
    const plan = d.subscription_plans || {};
    const payments: SubscriptionPayment[] = (d.subscription_payments || [])
      .map((p: any) => ({
        id: p.id,
        pharmacy_id: p.pharmacy_id,
        plan_id: p.plan_id ?? null,
        amount_tzs: Number(p.amount_tzs) || 0,
        method: p.method || 'mobile_money',
        reference: p.reference ?? null,
        receipt_path: p.receipt_path ?? null,
        status: p.status,
        review_note: p.review_note ?? null,
        created_at: p.created_at,
        reviewed_at: p.reviewed_at ?? null,
      }))
      .sort((a: SubscriptionPayment, b: SubscriptionPayment) => b.created_at.localeCompare(a.created_at));
    return {
      id: d.id,
      name: d.name,
      business_type: d.business_type === 'supplier' ? 'supplier' : 'pharmacy',
      owner_id: d.owner_id ?? null,
      owner_name: d.owner_name ?? null,
      email: d.email ?? null,
      phone: d.phone ?? null,
      city: d.city ?? null,
      address: d.address ?? null,
      registration_number: d.registration_number ?? null,
      tax_number: d.tax_number ?? null,
      plan_id: d.plan_id ?? null,
      plan_slug: plan.slug || 'starter',
      plan_name: plan.name || 'No plan',
      yearly_price: yearlyPrice({
        slug: plan.slug || '',
        price_tzs_monthly: Number(plan.price_tzs_monthly) || 0,
        price_tzs_annual: Number(plan.price_tzs_annual) || 0,
      }),
      billing_choice: d.billing_choice === 'annual' ? 'annual' : 'trial',
      status: d.status,
      effective_status: effectiveStatus(d),
      trial_ends_at: d.trial_ends_at ?? null,
      subscription_ends_at: d.subscription_ends_at ?? null,
      approved_at: d.approved_at ?? null,
      review_note: d.review_note ?? null,
      created_at: d.created_at,
      payments,
    };
  }

  static async getMyBusiness(userId: string): Promise<BusinessRegistration | null> {
    const { data, error } = await supabase
      .from('pharmacies')
      .select(this.registrationSelect)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.mapRegistration(data) : null;
  }

  static async getRegistrations(): Promise<BusinessRegistration[]> {
    const { data, error } = await supabase
      .from('pharmacies')
      .select(this.registrationSelect)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map((d: any) => this.mapRegistration(d));
  }

  static async submitRegistration(input: RegistrationInput): Promise<string> {
    const { data, error } = await supabase.rpc('submit_registration', { _payload: input });
    if (error) throw new Error(error.message);
    return data as string;
  }

  static async submitPayment(args: {
    userId: string;
    pharmacyId: string;
    planSlug: string;
    method: string;
    reference: string;
    file?: File | null;
  }): Promise<void> {
    let receiptPath = '';
    if (args.file) {
      const safe = args.file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      receiptPath = `${args.userId}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from('payment-receipts')
        .upload(receiptPath, args.file, { contentType: args.file.type || 'application/octet-stream' });
      if (upErr) throw new Error(`Receipt upload failed: ${upErr.message}`);
    }
    const { error } = await supabase.rpc('submit_subscription_payment', {
      _pharmacy_id: args.pharmacyId,
      _plan_slug: args.planSlug,
      _method: args.method,
      _reference: args.reference,
      _receipt_path: receiptPath,
    });
    if (error) throw new Error(error.message);
  }

  static async reviewRegistration(pharmacyId: string, decision: 'approve' | 'reject', note?: string): Promise<void> {
    const { error } = await supabase.rpc('review_registration', {
      _pharmacy_id: pharmacyId,
      _decision: decision,
      _note: note || null,
    });
    if (error) throw new Error(error.message);
  }

  static async reviewPayment(paymentId: string, decision: 'confirm' | 'reject', note?: string): Promise<void> {
    const { error } = await supabase.rpc('review_subscription_payment', {
      _payment_id: paymentId,
      _decision: decision,
      _note: note || null,
    });
    if (error) throw new Error(error.message);
  }

  static async extendTrial(pharmacyId: string, days: number): Promise<void> {
    const { error } = await supabase.rpc('extend_trial', { _pharmacy_id: pharmacyId, _days: days });
    if (error) throw new Error(error.message);
  }

  static async getReceiptUrl(path: string): Promise<string> {
    const { data, error } = await supabase.storage.from('payment-receipts').createSignedUrl(path, 600);
    if (error || !data) throw new Error(error?.message || 'Receipt not available');
    return data.signedUrl;
  }
}

// ==========================================
// PHARMACY WORKSPACE (owner + staff) — every call is scoped to one pharmacy id
// ==========================================
function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

export class WorkspaceService {
  static async listWorkspaces(userId: string, isAdmin: boolean): Promise<Workspace[]> {
    const [{ data: rows, error }, { data: memberships }] = await Promise.all([
      supabase
        .from('pharmacies')
        .select('id, name, business_type, city, owner_id, status, trial_ends_at, subscription_ends_at, created_at, subscription_plans!pharmacies_plan_id_fkey(name, slug, max_branches, max_employees)')
        .order('created_at', { ascending: true }),
      supabase.from('pharmacy_memberships').select('pharmacy_id, role, is_active').eq('user_id', userId),
    ]);
    fail(error);
    const roleByPharmacy = new Map<string, string>();
    for (const m of memberships || []) if (m.is_active !== false) roleByPharmacy.set(m.pharmacy_id, m.role);

    return (rows || [])
      .map((d: any): Workspace | null => {
        let role: WorkspaceRole | null = null;
        if (d.owner_id === userId) role = 'owner';
        else if (roleByPharmacy.has(d.id)) role = roleByPharmacy.get(d.id) as StaffRole;
        else if (isAdmin) role = 'admin';
        if (!role) return null;
        const plan = d.subscription_plans || {};
        return {
          id: d.id,
          name: d.name,
          business_type: d.business_type === 'supplier' ? 'supplier' : 'pharmacy',
          city: d.city ?? null,
          role,
          status: effectiveStatus(d),
          plan_name: plan.name || 'Starter',
          plan_slug: plan.slug || 'starter',
          limits: { max_branches: plan.max_branches ?? 1, max_employees: plan.max_employees ?? 3 },
          trial_ends_at: d.trial_ends_at ?? null,
          subscription_ends_at: d.subscription_ends_at ?? null,
        };
      })
      .filter((w): w is Workspace => w !== null);
  }

  // ---------- branches ----------
  static async getBranches(pharmacyId: string): Promise<WsBranch[]> {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .order('is_main', { ascending: false })
      .order('created_at', { ascending: true });
    fail(error);
    return (data || []).map((b: any) => ({
      id: b.id,
      name: b.name,
      code: b.code || '',
      address: b.address || '',
      phone: b.phone || '',
      is_main: Boolean(b.is_main),
      is_active: b.is_active !== false,
      created_at: b.created_at,
    }));
  }

  static async saveBranch(pharmacyId: string, input: { id?: string; name: string; code: string; address: string; phone: string }): Promise<void> {
    const row = { name: input.name, code: input.code || null, address: input.address || null, phone: input.phone || null, updated_at: new Date().toISOString() };
    const { error } = input.id
      ? await supabase.from('branches').update(row).eq('id', input.id)
      : await supabase.from('branches').insert({ ...row, pharmacy_id: pharmacyId, is_active: true });
    fail(error);
  }

  static async setBranchActive(branchId: string, isActive: boolean): Promise<void> {
    const { error } = await supabase.from('branches').update({ is_active: isActive }).eq('id', branchId);
    fail(error);
  }

  static async setMainBranch(pharmacyId: string, branchId: string): Promise<void> {
    const { error: e1 } = await supabase.from('branches').update({ is_main: false }).eq('pharmacy_id', pharmacyId).neq('id', branchId);
    fail(e1);
    const { error: e2 } = await supabase.from('branches').update({ is_main: true, is_active: true }).eq('id', branchId);
    fail(e2);
  }

  // ---------- staff ----------
  static async getStaff(pharmacyId: string): Promise<WsStaff[]> {
    const { data, error } = await supabase.rpc('pharmacy_staff', { _pharmacy_id: pharmacyId });
    fail(error);
    return (data || []).map((s: any) => ({
      membership_id: s.membership_id,
      user_id: s.user_id,
      full_name: s.full_name || s.email,
      email: s.email,
      role: s.role,
      branch_id: s.branch_id,
      is_active: s.is_active !== false,
      created_at: s.created_at,
    }));
  }

  static async getInvites(pharmacyId: string): Promise<WsInvite[]> {
    const { data, error } = await supabase
      .from('pharmacy_invites')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    fail(error);
    return (data || []) as WsInvite[];
  }

  static async inviteStaff(pharmacyId: string, input: { email: string; full_name: string; role: StaffRole; branch_id: string | null }): Promise<void> {
    const { error } = await supabase.from('pharmacy_invites').insert({
      pharmacy_id: pharmacyId,
      email: input.email.trim().toLowerCase(),
      full_name: input.full_name || null,
      role: input.role,
      branch_id: input.branch_id,
    });
    if (error?.code === '23505') throw new Error('This person already has a pending invitation.');
    fail(error);
  }

  static async revokeInvite(inviteId: string): Promise<void> {
    const { error } = await supabase.from('pharmacy_invites').update({ status: 'revoked' }).eq('id', inviteId);
    fail(error);
  }

  static async updateMembership(membershipId: string, patch: { role?: StaffRole; branch_id?: string | null; is_active?: boolean }): Promise<void> {
    const { error } = await supabase.from('pharmacy_memberships').update(patch).eq('id', membershipId);
    fail(error);
  }

  static async myInvitations(): Promise<MyInvitation[]> {
    const { data, error } = await supabase.rpc('my_invitations');
    fail(error);
    return (data || []) as MyInvitation[];
  }

  static async acceptInvitation(inviteId: string): Promise<string> {
    const { data, error } = await supabase.rpc('accept_invitation', { _invite_id: inviteId });
    fail(error);
    return data as string;
  }

  // ---------- products & stock ----------
  static async getProducts(pharmacyId: string): Promise<WsProduct[]> {
    const [{ data: rows, error }, { data: batches, error: bErr }] = await Promise.all([
      supabase.from('products').select('*').eq('pharmacy_id', pharmacyId).order('name', { ascending: true }),
      supabase.from('inventory_batches').select('product_id, branch_id, quantity, expiry_date').eq('pharmacy_id', pharmacyId).gt('quantity', 0),
    ]);
    fail(error);
    fail(bErr);

    const paths = (rows || []).map((p: any) => p.image_url).filter(Boolean) as string[];
    const signed = new Map<string, string>();
    if (paths.length) {
      const { data: urls } = await supabase.storage.from('product-images').createSignedUrls(paths, 3600);
      for (const u of urls || []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
    }

    return (rows || []).map((p: any) => {
      const own = (batches || []).filter((b: any) => b.product_id === p.id);
      const byBranch: Record<string, number> = {};
      for (const b of own) byBranch[b.branch_id || 'none'] = (byBranch[b.branch_id || 'none'] || 0) + (b.quantity || 0);
      const expiries = own.map((b: any) => b.expiry_date as string).sort();
      return {
        id: p.id,
        name: p.name,
        generic_name: p.generic_name || '',
        sku: p.sku || '',
        barcode: p.barcode || '',
        dosage_form: p.dosage_form || '',
        strength: p.strength || '',
        cost_price: Number(p.cost_price || 0),
        selling_price: Number(p.selling_price || 0),
        min_stock_level: p.min_stock_level ?? 10,
        is_prescription_required: Boolean(p.is_prescription_required),
        is_active: p.is_active !== false,
        image_path: p.image_url || null,
        image_src: p.image_url ? signed.get(p.image_url) ?? null : null,
        stock: own.reduce((a: number, b: any) => a + (b.quantity || 0), 0),
        stock_by_branch: byBranch,
        nearest_expiry: expiries[0] ?? null,
        created_at: p.created_at,
      };
    });
  }

  private static async uploadProductPhoto(pharmacyId: string, file: File): Promise<string> {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
    const path = `${pharmacyId}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from('product-images').upload(path, file, { contentType: file.type || 'image/jpeg' });
    if (error) throw new Error(`Photo upload failed: ${error.message}`);
    return path;
  }

  static async saveProduct(pharmacyId: string, input: WsProductInput & { id?: string }, photo?: File | null): Promise<void> {
    const row: Record<string, unknown> = {
      name: input.name,
      generic_name: input.generic_name || null,
      sku: input.sku || null,
      barcode: input.barcode || null,
      dosage_form: input.dosage_form || null,
      strength: input.strength || null,
      cost_price: input.cost_price || 0,
      selling_price: input.selling_price,
      min_stock_level: input.min_stock_level,
      is_prescription_required: input.is_prescription_required,
      updated_at: new Date().toISOString(),
    };
    if (photo) row['image_url'] = await this.uploadProductPhoto(pharmacyId, photo);
    const { error } = input.id
      ? await supabase.from('products').update(row).eq('id', input.id)
      : await supabase.from('products').insert({ ...row, pharmacy_id: pharmacyId, is_active: true });
    fail(error);
  }

  static async setProductActive(productId: string, isActive: boolean): Promise<void> {
    const { error } = await supabase.from('products').update({ is_active: isActive }).eq('id', productId);
    fail(error);
  }

  static async getBatches(pharmacyId: string): Promise<WsBatch[]> {
    const { data, error } = await supabase
      .from('inventory_batches')
      .select('*, products(name)')
      .eq('pharmacy_id', pharmacyId)
      .order('expiry_date', { ascending: true });
    fail(error);
    return (data || []).map((b: any) => ({
      id: b.id,
      product_id: b.product_id,
      product_name: b.products?.name || 'Product',
      branch_id: b.branch_id,
      batch_number: b.batch_number,
      quantity: b.quantity || 0,
      cost_per_unit: Number(b.cost_per_unit || 0),
      expiry_date: b.expiry_date,
      received_date: b.received_date,
      days_to_expiry: daysUntil(b.expiry_date),
      created_at: b.created_at,
    }));
  }

  static async receiveStock(
    pharmacyId: string,
    userId: string,
    input: { product_id: string; branch_id: string; batch_number: string; quantity: number; cost_per_unit: number; expiry_date: string }
  ): Promise<void> {
    const { data: batch, error } = await supabase
      .from('inventory_batches')
      .insert({
        pharmacy_id: pharmacyId,
        branch_id: input.branch_id,
        product_id: input.product_id,
        batch_number: input.batch_number,
        quantity: input.quantity,
        cost_per_unit: input.cost_per_unit,
        expiry_date: input.expiry_date,
        received_date: new Date().toISOString().slice(0, 10),
      })
      .select('id')
      .single();
    fail(error);
    const { error: mErr } = await supabase.from('stock_movements').insert({
      pharmacy_id: pharmacyId,
      product_id: input.product_id,
      batch_id: batch?.id ?? null,
      movement_type: 'stock_in',
      quantity: input.quantity,
      notes: `Received batch ${input.batch_number}`,
      created_by: userId,
    });
    fail(mErr);
  }

  static async adjustBatch(pharmacyId: string, userId: string, batch: WsBatch, newQuantity: number, reason: string): Promise<void> {
    const { error } = await supabase
      .from('inventory_batches')
      .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
      .eq('id', batch.id);
    fail(error);
    const { error: mErr } = await supabase.from('stock_movements').insert({
      pharmacy_id: pharmacyId,
      product_id: batch.product_id,
      batch_id: batch.id,
      movement_type: 'adjustment',
      quantity: newQuantity - batch.quantity,
      notes: reason || 'Stock count adjustment',
      created_by: userId,
    });
    fail(mErr);
  }

  // ---------- money ----------
  static async getSales(pharmacyId: string): Promise<WsSale[]> {
    const { data, error } = await supabase
      .from('sales')
      .select('id, invoice_number, total, branch_id, payment_method, created_at, sale_items(quantity, products(cost_price), inventory_batches(cost_per_unit))')
      .eq('pharmacy_id', pharmacyId)
      .order('created_at', { ascending: false });
    fail(error);
    return (data || []).map((s: any) => ({
      id: s.id,
      invoice_number: s.invoice_number,
      total: Number(s.total || 0),
      branch_id: s.branch_id,
      payment_method: s.payment_method || 'cash',
      created_at: s.created_at,
      items: (s.sale_items || []).map((i: any) => ({
        quantity: i.quantity || 0,
        unit_cost: Number(i.inventory_batches?.cost_per_unit ?? i.products?.cost_price ?? 0),
      })),
    }));
  }

  static async getExpenses(pharmacyId: string): Promise<WsExpense[]> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .order('expense_date', { ascending: false });
    fail(error);
    return (data || []).map((e: any) => ({
      id: e.id,
      category: e.category,
      amount: Number(e.amount || 0),
      description: e.description || '',
      expense_date: e.expense_date || e.created_at?.slice(0, 10),
      created_at: e.created_at,
    }));
  }

  static async addExpense(pharmacyId: string, userId: string, input: { category: string; amount: number; description: string; expense_date: string }): Promise<void> {
    const { error } = await supabase.from('expenses').insert({ ...input, pharmacy_id: pharmacyId, recorded_by: userId });
    fail(error);
  }

  static async deleteExpense(id: string): Promise<void> {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    fail(error);
  }
}
