# 浠诲姟璁板綍

## 浠诲姟鍚嶇О
- 瀹炵幇 Smart Import 绗簩杞鍏ヨ嚜鍔ㄩ噸缃笌鍏抽棴

## 鎵ц鏃堕棿
- 寮€濮嬫椂闂达細0001-01-01 00:00:00
- 缁撴潫鏃堕棿锛?026-04-08 10:29:58

## 浠撳簱鏍圭洰褰?
- C:\Users\Administrator\Desktop\BrainFlow

## 浠诲姟鐩爣
- 瀹炵幇 Smart Import 鍦?Apply 鎴愬姛鍚庤嚜鍔ㄦ竻绌烘湰杞鍏ヤ細璇濆苟鍏抽棴寮圭獥锛屼繚璇佷笅涓€娆″鍏ヨ繘鍏ュ叏鏂扮┖鐧戒細璇濄€?

## 瑙ｅ喅鐨勯棶棰?
- 鍦?text-import-store 涓柊澧炵嫭绔?resetSession 鍔ㄤ綔锛岀敤浜庢竻绌?preview銆乨raftTree銆乻ourceFiles銆乨raftText銆佽繘搴︺€乷verride 绛夋暣杞鍏ヤ細璇濈姸鎬併€?
- 淇濇寔 close() 浠呰礋璐ｅ叧闂脊绐楋紝涓嶅啀鎵挎媴娓呬細璇濊亴璐ｏ紝淇濈暀鐜版湁涓€斿叧闂涔夈€?
- 鍦?MapEditorPage 鐨?apply 鎴愬姛鍒嗘敮涓茶仈鈥滃簲鐢ㄦ枃妗?-> resetSession -> close鈥濓紝淇濊瘉涓嬩竴娆″鍏ヤ粠鍏ㄦ柊绌虹櫧浼氳瘽寮€濮嬨€?
- 琛ュ厖 store 涓庨〉闈㈠洖褰掓祴璇曪紝骞堕獙璇?TextImportDialog 鍘熸湁娴嬭瘯鏈鐮村潖銆?

## 闂鍘熷洜
- 鏃у疄鐜版妸鈥滃叧闂脊绐椻€濆拰鈥滅粨鏉熷鍏ヤ細璇濃€濇贩鍦ㄥ悓涓€浜や簰棰勬湡涓嬶紝浣?close() 瀹為檯涓嶄細娓呯┖ preview銆佹潵婧愭枃浠跺拰鑽夌鏁版嵁锛屽鑷存垚鍔熷鍏ュ悗鍐嶆杩涘叆鏃跺彲鑳界湅鍒颁笂涓€杞畫鐣欍€?

## 灏濊瘯鐨勮В鍐冲姙娉?
1. 鎵╁睍 TextImportState 鎺ュ彛骞舵柊澧?createResetSessionState()锛屾妸浼氳瘽绾у瓧娈典笌绐楀彛寮€鍏宠涔夋媶寮€銆?
2. 鍦?MapEditorPage 鎺ュ叆 resetSession selector锛屽苟鍦?handleApplyTextImport 鎴愬姛鍚庢墽琛?reset + close銆?
3. 涓?text-import-store.test.ts 鏂板鎴愬姛瀵煎叆鍚?resetSession 娓呯┖鐘舵€佺殑鏂█锛屽悓鏃跺姞寮烘櫘閫?close 淇濈暀鐘舵€佺殑鏂█銆?
4. 璋冩暣 MapEditorPage.test.tsx 鐨?import store / dialog mock锛屾柊澧?apply 鎴愬姛鍚庤皟鐢?resetSession 涓?close 鐨勯〉闈㈢骇娴嬭瘯銆?
5. 鎵ц vitest 瀹氬悜娴嬭瘯锛歵ext-import-store銆丮apEditorPage銆乀extImportDialog锛屼笁缁勫叏閮ㄩ€氳繃銆?

## 鏄惁鎴愬姛瑙ｅ喅
- 鐘舵€侊細鎴愬姛
- 璇存槑锛氬凡瀹屾垚瀹炵幇骞堕€氳繃鐩稿叧娴嬭瘯锛汼mart Import 鐜板湪浼氬湪 Apply 鎴愬姛鍚庤嚜鍔ㄦ竻绌轰細璇濆苟鍏抽棴寮圭獥銆?

## 鐩稿叧鏂囦欢
- src/features/import/text-import-store.ts
- src/pages/editor/MapEditorPage.tsx
- src/features/import/text-import-store.test.ts
- src/pages/editor/MapEditorPage.test.tsx
- src/features/import/components/TextImportDialog.test.tsx

## 閬楃暀闂/涓嬩竴姝?
- 濡傛灉鍚庣画甯屾湜鎴愬姛鍚庝繚鐣欏脊绐楀苟鐩存帴鍥炲埌 Step 1锛屽彲澶嶇敤鏈 resetSession 鍔ㄤ綔锛屽彧璋冩暣椤甸潰灞傛敹灏炬祦绋嬨€?
- 濡傞渶杩涗竴姝ュ姞寮鸿繛缁鍏ヤ綋楠岋紝鍙湪涓嬩竴杞ˉ涓€鏉＄鍒扮 UI 娴嬭瘯瑕嗙洊鈥滄垚鍔熷鍏ュ悗鍐嶅绗簩涓枃浠垛€濈殑瀹屾暣璺緞銆?
