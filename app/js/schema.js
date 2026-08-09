/** Canonical Unreal DA field keys for this dialogue asset (shared GUIDs across days). */
export const FIELD_DEFS = [
  { key: 'Line1_9_8D8F2CF34BC4E1C347039CBFC9454FA5', role: 'line', group: 'open', index: 1, label: 'Line 1' },
  { key: 'Line2_10_31E4E31F4760C365DC0487B0A7E34CD4', role: 'line', group: 'open', index: 2, label: 'Line 2' },
  { key: 'Line3_11_E665BEB44392808F3C1539ADED037324', role: 'line', group: 'open', index: 3, label: 'Line 3' },
  { key: 'Line4_17_367AB18244586E69620720B2F11E376F', role: 'line', group: 'open', index: 4, label: 'Line 4' },
  { key: 'Line5_18_44479EA54D09D6EB2A023BBE67F56042', role: 'line', group: 'open', index: 5, label: 'Line 5' },

  { key: 'Reply1_25_E59F96C24CBD5635D1328EBB487B4F2D', role: 'reply', group: 'choice1', index: 1, label: 'Reply A' },
  { key: 'Reply2_27_97EF7CC2488C9E9A0CF666B3FFD69595', role: 'reply', group: 'choice1', index: 2, label: 'Reply B' },

  { key: 'R1Line6_42_63D053DD4ADBDEA1E508AAA8B2718354', role: 'line', group: 'r1', index: 6, label: 'Line 6' },
  { key: 'R1Line7_43_C28899A34EF165D728347F8F4C3B4ED2', role: 'line', group: 'r1', index: 7, label: 'Line 7' },
  { key: 'R1Line8_44_3683A767477B8B32009EA1A5692CA8D8', role: 'line', group: 'r1', index: 8, label: 'Line 8' },
  { key: 'R1Line9_45_AB36750148A6954A57563892CA7C2269', role: 'line', group: 'r1', index: 9, label: 'Line 9' },
  { key: 'R1Line10_46_A88F09DA49233CE89899698E187FC95F', role: 'line', group: 'r1', index: 10, label: 'Line 10' },

  { key: 'R2Line11_54_F3C134FA4F1D395748CA7FA8EB6C18B3', role: 'line', group: 'r2', index: 11, label: 'Line 11' },
  { key: 'R2Line12_55_ACE1BE8F4919FFED50B98FBC9D93D821', role: 'line', group: 'r2', index: 12, label: 'Line 12' },
  { key: 'R2Line13_59_F83FC6DF4180D83AB75E939F0CFF3D6C', role: 'line', group: 'r2', index: 13, label: 'Line 13' },
  { key: 'R2Line14_60_196DF5A447DE9AC76A6F2C9FF87D23D9', role: 'line', group: 'r2', index: 14, label: 'Line 14' },
  { key: 'R2Line15_61_033748EE4D634CE7EADC02A4DFA964C9', role: 'line', group: 'r2', index: 15, label: 'Line 15' },

  { key: 'Reply3_64_265787464E08C871E803CA8ECDF7A288', role: 'reply', group: 'choice2', index: 3, label: 'Reply C' },
  { key: 'Reply4_65_97C340134332769E5B31E59898DA213E', role: 'reply', group: 'choice2', index: 4, label: 'Reply D' },

  { key: 'R3Line16_71_AAA4EEF14828CCF6A2FE998C13466995', role: 'line', group: 'r3', index: 16, label: 'Line 16' },
  { key: 'R3Line17_72_6D90451D4311426E836BA094AD815B51', role: 'line', group: 'r3', index: 17, label: 'Line 17' },
  { key: 'R3Line18_73_9462D97946E1885EDB0C14BB90D44B8C', role: 'line', group: 'r3', index: 18, label: 'Line 18' },
  { key: 'R3Line19_74_478DE63E458C87A57395DD8DFB873CB8', role: 'line', group: 'r3', index: 19, label: 'Line 19' },
  { key: 'R3Line20_75_D56C434F40DC677B7EAAFDB438EC122C', role: 'line', group: 'r3', index: 20, label: 'Line 20' },

  { key: 'R4Line21_81_6D5E1D2644C81B0043F6B08BFF112DB0', role: 'line', group: 'r4', index: 21, label: 'Line 21' },
  { key: 'R4Line22_82_B05C047F44174692E791878810B4C152', role: 'line', group: 'r4', index: 22, label: 'Line 22' },
  { key: 'R4Line23_83_8A280E1140E936D2E07C3F88658A9C22', role: 'line', group: 'r4', index: 23, label: 'Line 23' },
  { key: 'R4Line24_84_321025F940C9FBB50F03878DBB1E012A', role: 'line', group: 'r4', index: 24, label: 'Line 24' },
  { key: 'R4Line25_85_3A073DCB4E59021B3C7BD7B1B2F75E44', role: 'line', group: 'r4', index: 25, label: 'Line 25' },

  { key: 'Reply5_88_097433714C65811A527CF9A93691D562', role: 'reply', group: 'choice3', index: 5, label: 'Reply E' },
  { key: 'Reply6_89_91B9C98F480213D2BF017E81C5BD4EDC', role: 'reply', group: 'choice3', index: 6, label: 'Reply F' },

  { key: 'R5Line26_95_29D6473A4A953916F310AD8F0513809C', role: 'line', group: 'r5', index: 26, label: 'Line 26' },
  { key: 'R6Line31_105_16C662A74818FC589292868239262EFA', role: 'line', group: 'r6', index: 31, label: 'Line 31' },
];

export const FIELD_BY_KEY = Object.fromEntries(FIELD_DEFS.map((f) => [f.key, f]));

export const GROUP_META = {
  open: { title: 'Opening', speaker: 'npc' },
  choice1: { title: 'First choice', speaker: 'player' },
  r1: { title: 'After Reply A', speaker: 'npc', afterReply: 1 },
  r2: { title: 'After Reply B', speaker: 'npc', afterReply: 2 },
  choice2: { title: 'Second choice', speaker: 'player' },
  r3: { title: 'After Reply C', speaker: 'npc', afterReply: 3 },
  r4: { title: 'After Reply D', speaker: 'npc', afterReply: 4 },
  choice3: { title: 'Final choice', speaker: 'player' },
  r5: { title: 'After Reply E', speaker: 'npc', afterReply: 5 },
  r6: { title: 'After Reply F', speaker: 'npc', afterReply: 6 },
};

export function emptyDay() {
  const fields = {};
  for (const f of FIELD_DEFS) fields[f.key] = '';
  return { fields };
}

export function keysForGroup(group) {
  return FIELD_DEFS.filter((f) => f.group === group);
}
