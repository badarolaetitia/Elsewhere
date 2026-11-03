create table public.user_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('saved','visits','plans')),
  item_id text not null check (length(item_id) between 1 and 500),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 20000 and payload->>'id' = item_id),
  primary key (user_id,kind,item_id)
);
alter table public.user_items enable row level security;
revoke all on public.user_items from anon;
grant select,insert,update,delete on public.user_items to authenticated;
create policy "Read own items" on public.user_items for select to authenticated using ((select auth.uid())=user_id);
create policy "Insert own items" on public.user_items for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Update own items" on public.user_items for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Delete own items" on public.user_items for delete to authenticated using ((select auth.uid())=user_id);
create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from auth.users where id=auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public,anon;
grant execute on function public.delete_my_account() to authenticated;
