alter table public.user_books drop constraint if exists user_books_book_id_fkey;

alter table public.books
alter column id type text using id::text;

alter table public.user_books
alter column book_id type text using book_id::text;

alter table public.user_books
add constraint user_books_book_id_fkey
foreign key (book_id)
references public.books (id)
on delete cascade;
