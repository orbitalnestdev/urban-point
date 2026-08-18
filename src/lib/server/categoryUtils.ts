export interface FormattedCategoryOption {
  $id: string;
  nombre: string;
  displayName: string;
  isSub: boolean;
  parentId: string | null;
  parentName: string | null;
  depth: number;
}

/**
 * Normaliza y organiza una lista de categorías en una estructura de árbol jerárquica:
 * Categoría Principal -> Subcategorías indentadas.
 */
export function buildCategoryTree(categories: any[]): FormattedCategoryOption[] {
  if (!Array.isArray(categories) || categories.length === 0) return [];

  const getParentId = (c: any): string | null => {
    if (!c.parent_id) return null;
    if (typeof c.parent_id === 'string') return c.parent_id.trim() || null;
    return c.parent_id.$id || null;
  };

  const rootCategories = categories.filter(c => !getParentId(c));
  rootCategories.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  const result: FormattedCategoryOption[] = [];

  for (const root of rootCategories) {
    result.push({
      $id: root.$id,
      nombre: root.nombre,
      displayName: root.nombre,
      isSub: false,
      parentId: null,
      parentName: null,
      depth: 0
    });

    const subcategories = categories.filter(c => getParentId(c) === root.$id);
    subcategories.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    for (const sub of subcategories) {
      result.push({
        $id: sub.$id,
        nombre: sub.nombre,
        displayName: `${root.nombre} › ${sub.nombre}`,
        isSub: true,
        parentId: root.$id,
        parentName: root.nombre,
        depth: 1
      });
    }
  }

  // Por si existen subcategorías cuyos padres no estén en rootCategories
  const processedIds = new Set(result.map(r => r.$id));
  const orphans = categories.filter(c => !processedIds.has(c.$id));
  for (const orphan of orphans) {
    const parentId = getParentId(orphan);
    const parent = categories.find(c => c.$id === parentId);
    result.push({
      $id: orphan.$id,
      nombre: orphan.nombre,
      displayName: parent ? `${parent.nombre} › ${orphan.nombre}` : orphan.nombre,
      isSub: !!parentId,
      parentId: parentId,
      parentName: parent?.nombre || null,
      depth: parentId ? 1 : 0
    });
  }

  return result;
}

/**
 * Devuelve el nombre completo formateado ("Padre › Subcategoría" o "Categoría Principal") para cualquier categoría dada.
 */
export function getCategoryDisplayName(catIdOrObj: any, categoryMap: Record<string, any>): string {
  if (!catIdOrObj) return 'Sin categoría';
  const cat = typeof catIdOrObj === 'string' ? categoryMap[catIdOrObj] : catIdOrObj;
  if (!cat) return 'Sin categoría';

  const parentId = typeof cat.parent_id === 'string' ? cat.parent_id : cat.parent_id?.$id;
  if (parentId && categoryMap[parentId]) {
    return `${categoryMap[parentId].nombre} › ${cat.nombre}`;
  }
  return cat.nombre;
}
