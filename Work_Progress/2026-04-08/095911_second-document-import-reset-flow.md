# 浠诲姟璁板綍

## 浠诲姟鍚嶇О
- 绗簩涓枃妗ｅ鍏ュ悗鐨勬竻鐞嗕笌缁х画瀵煎叆绛栫暐璇勪及

## 鎵ц鏃堕棿
- 寮€濮嬫椂闂达細2026-04-08 09:59:11
- 缁撴潫鏃堕棿锛?026-04-08 10:19:23

## 浠撳簱鏍圭洰褰?
- C:\Users\Administrator\Desktop\BrainFlow

## 浠诲姟鐩爣
- 璇勪及 Smart import 鍦ㄩ涓枃妗ｅ鍏ュ畬鎴愬悗缁х画瀵煎叆绗簩涓枃妗ｆ椂鐨勪氦浜掓柟妗堬紝鍒ゆ柇鏄惁闇€瑕佷竴閿竻闄ゆ垨鍏朵粬鏇寸ǔ濡ョ殑閲嶇疆鏈哄埗銆?

## 瑙ｅ喅鐨勯棶棰?
- 纭 TextImportDialog 鍏抽棴鍚庡彧閲嶇疆姝ラ鏄剧ず锛屼笉浼氭竻绌?preview銆乨raftTree銆乻ourceFiles 绛夋牳蹇冨鍏ョ姸鎬併€?
- 纭 text-import-store 鐨?close() 浠呭叧闂脊绐楀苟娓呯悊灏戦噺瑕嗙洊椤癸紝涓嶉€傚悎浣滀负鈥滀笅涓€杞鍏モ€濈殑褰诲簳閲嶇疆鍏ュ彛銆?
- 鏄庣‘寤鸿涓嶆柊澧炲崟绾殑涓€閿竻绌烘寜閽紝鑰屾槸鍦ㄥ鍏ユ垚鍔熷悗鑷姩鎵ц鈥滅粨鏉熸湰杞苟閲嶇疆浼氳瘽鈥濈殑娴佺▼銆?
- 缁撳悎鏈疆閫夋嫨锛岀‘瀹氭垚鍔熷簲鐢ㄥ悗搴旇嚜鍔ㄥ叧闂脊绐楋紱鐢ㄦ埛涓嬫鐐瑰嚮瀵煎叆鏃惰繘鍏ュ叏鏂扮┖鐧戒細璇濄€?

## 闂鍘熷洜
- 褰撳墠 close() 璇箟鏄€滃叧闂?鏀惰捣寮圭獥鈥濓紝涓嶆槸鈥滅粨鏉熷鍏ヤ細璇濃€濓紱鍥犳鏃?preview銆佹潵婧愭枃浠朵笌鑽夌鐘舵€佷細缁х画淇濈暀锛屽鏄撹鐢ㄦ埛璇互涓虹浜屾瀵煎叆宸茬粡鏄叏鏂颁細璇濄€?

## 灏濊瘯鐨勮В鍐冲姙娉?
1. 妫€绱?Smart import 鐩稿叧瀹炵幇涓庢祴璇曪紝瀹氫綅 TextImportDialog銆乼ext-import-store 涓?MapEditorPage 鐨勬帴绾跨偣銆?
2. 鏍稿 TextImportDialog 鐨?reopen 娴嬭瘯涓?store 鐨?close 琛屼负锛岀‘璁ょ幇鐘舵槸鈥滃洖鍒扮涓€姝ヤ絾涓嶆竻绌烘棫鏁版嵁鈥濄€?
3. 鍒嗘瀽 startSinglePreview / startBatchPreview / applyPreview 鐨勭姸鎬佽鐩栬寖鍥达紝鍒ゆ柇绗簩涓枃妗ｅ鍏ユ椂搴旈噰鐢ㄧ嫭绔嬮噸缃姩浣滆€屼笉鏄鐢?close銆?
4. 閫氳繃浜や簰鍋忓ソ纭锛岄攣瀹氣€滃鍏ユ垚鍔熷悗鑷姩閲嶇疆骞惰嚜鍔ㄥ叧闂脊绐椻€濈殑鏂规銆?

## 鏄惁鎴愬姛瑙ｅ喅
- 鐘舵€侊細鎴愬姛
- 璇存槑锛氬凡瀹屾垚鏂规璇勪及骞堕攣瀹氭帹鑽愬疄鐜帮細涓嶆柊澧炴硾鐢ㄦ竻绌烘寜閽紝鏀逛负 apply 鎴愬姛鍚庤嚜鍔ㄩ噸缃細璇濆苟鍏抽棴寮圭獥銆?

## 鐩稿叧鏂囦欢
- src/features/import/components/TextImportDialog.tsx
- src/features/import/text-import-store.ts
- src/pages/editor/MapEditorPage.tsx
- src/features/import/components/TextImportDialog.test.tsx
- src/features/import/text-import-store.test.ts

## 閬楃暀闂/涓嬩竴姝?
- 鏂板鐙珛鐨?import session reset/complete action锛屼粎鍦?apply 鎴愬姛鍚庤皟鐢紝閬垮厤褰卞搷鏅€氬叧闂笌澶勭悊涓叧闂殑鐜版湁璇箟銆?
- 璋冩暣 apply 鎴愬姛鍚庣殑椤甸潰娴佽浆锛氬簲鐢ㄦ枃妗ｆ洿鏂板悗娓呯┖ import store锛屽苟鍏抽棴寮圭獥銆?
- 琛ュ厖 store 涓庡脊绐楃浉鍏虫祴璇曪紝瑕嗙洊鎴愬姛瀵煎叆鍚庡啀娆℃墦寮€搴斾负绌虹櫧鍒濆鎬佺殑鍦烘櫙銆?
