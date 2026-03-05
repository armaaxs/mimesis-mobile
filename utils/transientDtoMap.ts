const transientMap = new Map<string, unknown>();

export const setTransientDto = (id: string, dto: unknown) => {
  transientMap.set(id, dto);
};

export const getTransientDto = <T = any>(id: string): T | undefined => {
  return transientMap.get(id) as T | undefined;
};

export const deleteTransientDto = (id: string) => {
  transientMap.delete(id);
};

export const clearTransientDtoMap = () => {
  transientMap.clear();
};

export default transientMap;
