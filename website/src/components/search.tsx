'use client';
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search';
import { useDocsSearch } from 'fumadocs-core/search/client';
import { create } from '@orama/orama';
import { useI18n } from 'fumadocs-ui/contexts/i18n';
import { useMemo } from 'react';

function makeInitOrama(locale: string | undefined) {
  return () =>
    create({
      schema: { _: 'string' },
      // https://docs.orama.com/docs/orama-js/supported-languages
      language: locale === 'fr' ? 'french' : 'english',
    });
}

export default function DefaultSearchDialog(props: SharedProps) {
  const { locale } = useI18n(); // (optional) for i18n
  const initOrama = useMemo(() => makeInitOrama(locale), [locale]);

  const { search, setSearch, query } = useDocsSearch({
    type: 'static',
    initOrama,
    locale,
  });

  return (
    <SearchDialog search={search} onSearchChange={setSearch} isLoading={query.isLoading} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={query.data !== 'empty' ? query.data : null} />
      </SearchDialogContent>
    </SearchDialog>
  );
}
