import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "", 
});

export interface EpubStructure {
  title: string;
  author: string;
  chapters: { id: string; href: string }[];
  basePath: string;
}

export const parseEpub = async (zip: JSZip): Promise<EpubStructure> => {
  try {
    const containerEntry = zip.file('META-INF/container.xml');
    if (!containerEntry) throw new Error('Missing container.xml');

    const containerXml = await containerEntry.async('text');
    const containerData = xmlParser.parse(containerXml);

    const rootfiles = containerData?.container?.rootfiles?.rootfile;
    if (!rootfiles) throw new Error('Invalid container.xml: missing rootfile entry');

    const rootfile = Array.isArray(rootfiles) ? rootfiles[0] : rootfiles;
    const opfPath = rootfile?.['full-path'];

    if (!opfPath) throw new Error('Could not find OPF path');

    const basePath = opfPath.includes('/')
      ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1)
      : '';

    const opfEntry = zip.file(opfPath);
    if (!opfEntry) throw new Error('OPF file not found in zip at: ' + opfPath);

    const opfXml = await opfEntry.async('text');
    const opfData = xmlParser.parse(opfXml);

    const packageData = opfData?.package;
    if (!packageData) throw new Error('Invalid OPF: missing package node');

    const metadata = packageData.metadata ?? {};
    const manifest = packageData.manifest?.item;
    const spine = packageData.spine?.itemref;

    if (!manifest || !spine) {
      throw new Error('Invalid OPF: missing manifest or spine');
    }

    const spineArray = Array.isArray(spine) ? spine : [spine];
    const manifestArray = Array.isArray(manifest) ? manifest : [manifest];
    const manifestById = new Map<string, { href?: string }>(
      manifestArray
        .filter((item: { id?: string }) => Boolean(item?.id))
        .map((item: { id: string; href?: string }) => [item.id, item])
    );

    const chapters = spineArray
      .map((ref: { idref?: string }) => {
      const idref = ref?.idref;
      if (!idref) {
        return null;
      }

      const item = manifestById.get(idref);
      return {
        id: idref,
        href: item ? item.href : '',
      };
    })
      .filter((chapter): chapter is { id: string; href: string } => Boolean(chapter?.href));

    const getVal = (val: unknown): string | null => {
      if (!val) return null;
      if (typeof val === 'string') return val;
      if (typeof val === 'number') return String(val);
      if (Array.isArray(val)) {
        return getVal(val[0]);
      }
      if (typeof val === 'object') {
        const obj = val as Record<string, unknown>;
        const text = obj['#text'];
        if (typeof text === 'string') return text;
        const firstValue = Object.values(obj)[0];
        return getVal(firstValue);
      }
      return null;
    };

    return {
      title: getVal((metadata as Record<string, unknown>)['dc:title']) || 'Unknown Title',
      author: getVal((metadata as Record<string, unknown>)['dc:creator']) || 'Unknown Author',
      chapters,
      basePath,
    };

  } catch (error) {
    console.error('EPUB Parser Error:', error);
    throw error;
  }
};

export const getChapterText = async (zip: JSZip, href: string) => { // MAKE SURE TO PASS THE BASEPATH+HREF
  const file = zip.file(href); // Look up the file by the path you found
  if (file) {
    const htmlContent = await file.async("text"); // Extract the raw HTML
    return htmlContent;
  }
  return "Chapter not found";
};