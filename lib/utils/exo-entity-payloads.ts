import { DataAssemblyProps } from 'contentful-management'

export function buildDataAssemblySys(entity: DataAssemblyProps, version: number) {
  return {
    id: entity.sys.id,
    type: 'DataAssembly' as const,
    dataType: entity.sys.dataType,
    ...(entity.sys.variant ? { variant: entity.sys.variant } : {}),
    version
  }
}
