-- ============================================================
-- Moonee — Schéma Supabase (Postgres + Auth + RLS)
-- À exécuter une seule fois dans le SQL Editor du projet Supabase.
-- Modèle : « foyer » (household) partagé — toutes les données
-- financières appartiennent à un foyer ; chaque membre y accède
-- via household_members (RLS).
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Profils utilisateurs (1:1 avec auth.users)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  pseudo text not null default '',
  person_id text,                     -- 'tommy' | 'david' (liaison à la table PERSONS du seed)
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Foyers (espaces partagés)
-- ------------------------------------------------------------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Membres d'un foyer (rôles : admin | member)
create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Invitations en attente (inscription contrôlée — option 6B)
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null,
  role text not null default 'member',
  token uuid not null default gen_random_uuid(),
  status text not null default 'pending',   -- pending | accepted | revoked
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Helper : le user courant est-il membre du foyer ?
create or replace function public.is_household_member(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

-- Helper : création automatique du profil à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, pseudo)
  values (new.id, coalesce(new.raw_user_meta_data->>'pseudo', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Données financières (toutes rattachées à un foyer)
-- ============================================================

-- Comptes
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type text not null,
  name text not null,
  institution text,
  balance numeric(14,2) not null default 0,
  rate numeric(6,3),
  limit_amount numeric(14,2),
  opened date,
  created_at timestamptz not null default now()
);

-- Prêts
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  type text not null default 'immobilier',
  institution text,
  initial numeric(14,2) not null default 0,
  remaining numeric(14,2) not null default 0,
  monthly numeric(14,2) not null default 0,
  rate numeric(6,3) not null default 0,
  years int,
  start date,
  holder_kind text,                    -- 'person' | 'entity'
  holder_id text,
  created_at timestamptz not null default now()
);

-- Transactions
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  date date not null,
  label text not null,
  category text,
  type text not null default 'expense',
  amount numeric(14,2) not null default 0,
  necessity text,
  recurring boolean not null default false,
  bien_id uuid,
  created_at timestamptz not null default now()
);

-- Biens immobiliers
create table if not exists public.biens (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  address text,
  status text not null default 'loue',
  valeur numeric(14,2) not null default 0,
  owner_kind text,
  owner_id text,
  travaux_budget numeric(14,2) not null default 0,
  travaux_spent numeric(14,2) not null default 0,
  notes text,
  flow_keys jsonb,                  -- clés des séries récurrentes liées (bien.flowKeys)
  created_at timestamptz not null default now()
);

-- Comptes liés à un bien
create table if not exists public.bien_accounts (
  bien_id uuid not null references public.biens(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  primary key (bien_id, account_id)
);

-- Prêts liés à un bien
create table if not exists public.bien_loans (
  bien_id uuid not null references public.biens(id) on delete cascade,
  loan_id uuid not null references public.loans(id) on delete cascade,
  primary key (bien_id, loan_id)
);

-- Holdings / sociétés
create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  type text not null default 'sasu',
  color text,
  notes text,
  created_at timestamptz not null default now()
);

-- Associés d'une holding (personne ou entité + part %)
create table if not exists public.holding_owners (
  holding_id uuid not null references public.holdings(id) on delete cascade,
  owner_kind text not null,            -- 'person' | 'entity'
  owner_id text not null,
  share numeric(5,2) not null default 0,
  primary key (holding_id, owner_kind, owner_id)
);

-- Comptes liés à une holding
create table if not exists public.holding_accounts (
  holding_id uuid not null references public.holdings(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  primary key (holding_id, account_id)
);

-- Prêts liés à une holding
create table if not exists public.holding_loans (
  holding_id uuid not null references public.holdings(id) on delete cascade,
  loan_id uuid not null references public.loans(id) on delete cascade,
  primary key (holding_id, loan_id)
);

-- Dividendes mère-fille
create table if not exists public.dividends (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  from_holding uuid not null references public.holdings(id) on delete cascade,
  to_holding uuid not null references public.holdings(id) on delete cascade,
  month date not null,
  amount numeric(14,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

-- Répartition David / Tommy (configuration du foyer)
create table if not exists public.split_config (
  household_id uuid primary key references public.households(id) on delete cascade,
  rent numeric(14,2) not null default 0,
  salary_david numeric(14,2) not null default 0,
  salary_tommy numeric(14,2) not null default 0,
  share_david numeric(14,2) not null default 0,
  share_tommy numeric(14,2) not null default 0,
  debt_david numeric(14,2) not null default 0,
  debt_tommy numeric(14,2) not null default 0
);

-- Versements mensuels de la répartition
create table if not exists public.split_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  month date not null,
  david_paid numeric(14,2) not null default 0,
  tommy_paid numeric(14,2) not null default 0,
  note text,
  unique (household_id, month)
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.invitations enable row level security;
alter table public.accounts enable row level security;
alter table public.loans enable row level security;
alter table public.transactions enable row level security;
alter table public.biens enable row level security;
alter table public.holdings enable row level security;
alter table public.holding_owners enable row level security;
alter table public.holding_accounts enable row level security;
alter table public.holding_loans enable row level security;
alter table public.bien_accounts enable row level security;
alter table public.bien_loans enable row level security;
alter table public.dividends enable row level security;
alter table public.split_config enable row level security;
alter table public.split_payments enable row level security;

-- Profil : chacun ne voit/modifie que le sien
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Foyers : visibles si on en est membre
create policy "households_select_member" on public.households
  for select using (public.is_household_member(id));
create policy "households_insert_own" on public.households
  for insert with check (auth.uid() = created_by);
create policy "households_update_admin" on public.households
  for update using (
    exists (select 1 from public.household_members
            where household_id = id and user_id = auth.uid() and role = 'admin')
  );

-- Membres : un membre lit la liste du foyer ; seul l'admin gère
create policy "members_select" on public.household_members
  for select using (public.is_household_member(household_id));
create policy "members_insert_admin" on public.household_members
  for insert with check (
    exists (select 1 from public.household_members
            where household_id = household_members.household_id
              and user_id = auth.uid() and role = 'admin')
  );
/* Premier admin : l'utilisateur qui vient de créer le foyer peut s'ajouter
   lui-même comme admin (sans quoi la migration locale serait bloquée — il
   n'est pas encore membre). */
create policy "members_insert_self_admin" on public.household_members
  for insert with check (
    user_id = auth.uid() and role = 'admin'
    and exists (select 1 from public.households h
                where h.id = household_members.household_id and h.created_by = auth.uid())
  );
create policy "members_delete_admin" on public.household_members
  for delete using (
    exists (select 1 from public.household_members
            where household_id = household_members.household_id
              and user_id = auth.uid() and role = 'admin')
  );

-- Invitations : un membre du foyer peut en créer/lire ; admin peut révoquer
create policy "invitations_select" on public.invitations
  for select using (public.is_household_member(household_id));
create policy "invitations_insert" on public.invitations
  for insert with check (public.is_household_member(household_id));
create policy "invitations_update_admin" on public.invitations
  for update using (
    exists (select 1 from public.household_members
            where household_id = invitations.household_id
              and user_id = auth.uid() and role = 'admin')
  );

-- Données financières : accès aux membres du foyer (CRUD complet)
create policy "accounts_all" on public.accounts
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "loans_all" on public.loans
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "transactions_all" on public.transactions
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "biens_all" on public.biens
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "holdings_all" on public.holdings
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "dividends_all" on public.dividends
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "split_config_all" on public.split_config
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "split_payments_all" on public.split_payments
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Jointures des holdings : accès via la holding parente
create policy "holding_owners_all" on public.holding_owners
  for all using (
    exists (select 1 from public.holdings h
            where h.id = holding_owners.holding_id and public.is_household_member(h.household_id))
  ) with check (
    exists (select 1 from public.holdings h
            where h.id = holding_owners.holding_id and public.is_household_member(h.household_id))
  );
create policy "holding_accounts_all" on public.holding_accounts
  for all using (
    exists (select 1 from public.holdings h
            where h.id = holding_accounts.holding_id and public.is_household_member(h.household_id))
  ) with check (
    exists (select 1 from public.holdings h
            where h.id = holding_accounts.holding_id and public.is_household_member(h.household_id))
  );
create policy "holding_loans_all" on public.holding_loans
  for all using (
    exists (select 1 from public.holdings h
            where h.id = holding_loans.holding_id and public.is_household_member(h.household_id))
  ) with check (
    exists (select 1 from public.holdings h
            where h.id = holding_loans.holding_id and public.is_household_member(h.household_id))
  );

-- Jointures des biens : accès via le bien parent
create policy "bien_accounts_all" on public.bien_accounts
  for all using (
    exists (select 1 from public.biens b
            where b.id = bien_accounts.bien_id and public.is_household_member(b.household_id))
  ) with check (
    exists (select 1 from public.biens b
            where b.id = bien_accounts.bien_id and public.is_household_member(b.household_id))
  );
create policy "bien_loans_all" on public.bien_loans
  for all using (
    exists (select 1 from public.biens b
            where b.id = bien_loans.bien_id and public.is_household_member(b.household_id))
  ) with check (
    exists (select 1 from public.biens b
            where b.id = bien_loans.bien_id and public.is_household_member(b.household_id))
  );
