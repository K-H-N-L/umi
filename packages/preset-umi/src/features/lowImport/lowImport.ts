// Inspired by
// - https://github.com/google/zx
// - https://github.com/antfu/unplugin-auto-import
import { writeFileSync } from 'fs';
import { join } from 'path';
import { IApi } from '../../types';
import babelPlugin from './babelPlugin';

interface ILib {
  // 通常是包名
  importFrom: string;
  // 成员列表
  members?: string[];
  // 如有配置，用 obj.prop 的方式使用，比如 techui
  withObj?: string;
  // 是否是 import * as xx from 'xx'; 的方式
  namespaceImport?: string;
  // 是否是 import xx from 'xx'; 的方式
  defaultImport?: string;
}

export interface IOpts {
  withObjs: Record<string, any>;
  identifierToLib: Record<string, string>;
  defaultToLib: Record<string, string>;
  namespaceToLib: Record<string, string>;
}

const umiImportItems = [
  'createSearchParams',
  'Link',
  'matchPath',
  'matchRoutes',
  'NavLink',
  'Outlet',
  'renderClient',
  'useAppData',
  'useLocation',
  'useMatch',
  'useNavigate',
  'useOutlet',
  'useParams',
  'useResolvedPath',
  'useRouteData',
  'useRoutes',
  'useSearchParams',
  // TODO: 这两个似乎从 umi 引入不了
  //'ApplyPluginsType',
  //'PluginManager',
];

const reactImportItems = [
  'createElement',
  'createFactory',
  'cloneElement',
  'isValidElement',
  'createRef',
  'forwardRef',
  // hooks
  'useState',
  'useEffect',
  'useContext',
  'useReducer',
  'useCallback',
  'useMemo',
  'useRef',
  'useImperativeHandle',
  'useLayoutEffect',
  'useDebugValue',
];

export default (api: IApi) => {
  api.describe({
    key: 'lowImport',
    config: {
      schema(Joi) {
        return Joi.object({
          libs: Joi.array(),
          css: Joi.string(),
        });
      },
    },
    enableBy: api.EnableBy.config,
  });

  api.modifyAppData(async (memo) => {
    memo.lowImport = [
      await api.applyPlugins({
        key: 'addLowImportLibs',
        initialValue: [],
      }),
      ...(api.config.lowImport.libs || []),
    ];
  });

  api.onStart(() => {
    // generate dts
    const dts = api.appData.lowImport.map((lib: ILib) => {
      if (lib.withObj) {
        const memberDts = (lib.members || [])
          .map(
            (member) =>
              `${member}: typeof import('${lib.importFrom}')['${member}'],`,
          )
          .join('\n');
        return `const ${lib.withObj} : {\n${memberDts}\n};`;
      } else if (lib.namespaceImport) {
        return `const ${lib.namespaceImport}: typeof import('${lib.importFrom}');`;
      } else if (lib.defaultImport) {
        return `const ${lib.defaultImport}: typeof import('${lib.importFrom}')['default'];`;
      } else {
        return (lib.members || [])
          .map(
            (member) =>
              `const ${member}: typeof import('${lib.importFrom}')['${member}'];`,
          )
          .join('\n');
      }
    });

    // umi dts
    const umiDts = umiImportItems
      .map((item) => `const ${item}: typeof import('umi')['${item}']`)
      .join(';\n');

    // react dts
    const reactDts = reactImportItems
      .map((item) => `const ${item}: typeof import('react')['${item}']`)
      .join('\n');

    // TODO: styles 的类型提示
    const content =
      `
// generated by umi
declare global {
const React: typeof import('react');
${dts.join('\n')}
const styles: any;
${umiDts}
${reactDts}
}
export {}
    `.trim() + `\n`;
    writeFileSync(join(api.paths.cwd, 'lowImport.d.ts'), content, 'utf-8');
  });

  api.addBeforeBabelPresets(() => {
    const opts = normalizeLibs(api.appData.lowImport);
    const css = api.config.lowImport?.css || 'less';
    return [
      {
        plugins: [
          [babelPlugin, { opts, css, umiImportItems, reactImportItems }],
        ],
      },
    ];
  });
};

function normalizeLibs(libs: ILib[]): IOpts {
  const withObjs: Record<string, any> = {};
  const identifierToLib: Record<string, string> = {};
  const defaultToLib: Record<string, string> = {};
  const namespaceToLib: Record<string, string> = {};
  for (const lib of libs) {
    if (lib.withObj) {
      withObjs[lib.withObj] = lib;
    } else if (lib.namespaceImport) {
      namespaceToLib[lib.namespaceImport] = lib.importFrom;
    } else if (lib.defaultImport) {
      defaultToLib[lib.defaultImport] = lib.importFrom;
    } else {
      for (const member of lib.members || []) {
        identifierToLib[member] = lib.importFrom;
      }
    }
  }
  return {
    withObjs,
    identifierToLib,
    defaultToLib,
    namespaceToLib,
  };
}
