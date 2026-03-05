drop policy if exists "books_write_authenticated" on public.books;

create policy "books_write_authenticated"
on public.books
for all
to authenticated
using (true)
with check (true);
