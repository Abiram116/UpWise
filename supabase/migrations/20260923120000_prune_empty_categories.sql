-- Areas are derived from what's in the library: when an item is deleted or moved to another
-- category and that leaves its old category empty, the category goes too. Without this, deleted
-- items left behind areas like "Gaming" that kept showing up in chips and in the AI's prompt.
create or replace function public.prune_empty_category()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.categories c
  where c.id = old.category_id
    and not exists (select 1 from public.items i where i.category_id = c.id);
  return null;
end $$;

drop trigger if exists items_prune_empty_category on public.items;
create trigger items_prune_empty_category
  after delete or update of category_id on public.items
  for each row when (old.category_id is not null)
  execute function public.prune_empty_category();

-- One-time cleanup of the empties that piled up before this existed.
delete from public.categories c
where not exists (select 1 from public.items i where i.category_id = c.id);
