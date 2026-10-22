/** Public attribution is kept separate from loaders, gameplay and source-file tooling. */
export const MODEL_CREDITS = [
  { role: '玩家', title: 'Business Man - Low Polygon game character', author: 'manoeldarochadeoliveira', uid: 'b6f6740f883b4749abac47af0045a9dd', slug: 'business-man-low-polygon-game-character', changes: '统一单位、贴图优化、动作适配' },
  { role: '部门领导', title: 'Eric Rigged 001 - Rigged 3D Business Man', author: 'Renderpeople', uid: 'a46bc9f67aaa415bb4f3241eef900e7f', slug: 'eric-rigged-001-rigged-3d-business-man', changes: '骨骼适配、新增行走和快走、贴图优化；保留 NoAI 声明' },
  { role: '巡视领导', title: 'Businessman (Rigged)', author: 'Jungle Jim', uid: '8933d61fcb1e46f3aead661227bb4fed', slug: 'businessman-rigged', changes: '骨骼适配、新增行走和快走、网格与贴图优化' },
  { role: '安保主管', title: 'Police 3D Model', author: 'Aayush.Bhattarai', uid: 'c02d07f380f74bd485a4820f0f5f7541', slug: 'police-3d-model', changes: '新增骨骼与动画、改为无警徽安保服、贴图优化' },
  { role: '办公室家具', title: 'Modern Office Environment', author: 'Bl4ckGh0st', uid: '64144940384d426884f70a9c941bf124', slug: 'modern-office-environment', changes: '拆分家具、尺寸适配、贴图优化、重排五区布局' },
] as const;
export const MODEL_LICENSE = 'https://creativecommons.org/licenses/by/4.0/';
export const modelSource = (asset: typeof MODEL_CREDITS[number]): string => `https://sketchfab.com/3d-models/${asset.slug}-${asset.uid}`;
