-- Uma sala LEGRO. Sem dono de conta: o código é o segredo do convite.
-- A revisão na coluna é a trava. Quem chega atrasado não sobrescreve a linha.
create table if not exists legro_rooms (
  code text primary key,
  revision integer not null,
  document jsonb not null,
  updated_at timestamptz not null default now()
);
