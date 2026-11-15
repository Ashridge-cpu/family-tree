// Starter tree, written into a new family tree once on first open. Everything is editable afterwards.
// Kept deliberately light on private detail because this file is public: add exact dates, photos and documents in the app.
const P=(id,o)=>({id,given:'',surname:'',sex:'U',birth:'',birthPlace:'',death:'',deathPlace:'',deceased:false,notes:'',
  parents:[],spouses:[],marr:{},order:null,photos:[],docs:[],portrait:null,video:null,updatedAt:1,...o});
export const SEED_VERSION=1;
export const SEED=[
 P('mark',{given:'Mark',surname:'Turner',sex:'M',spouses:['emma'],notes:'Centre of the tree.\nAdd your parents, brothers and sisters with the buttons below, and your photos, CV and certificates in the panels on the right.'}),
 P('emma',{given:'Emma',surname:'Pears',sex:'F',birth:'1958',parents:['bill','emma-mother'],spouses:['mark'],order:3,
   notes:'Youngest of the three children of Bill Pears. Add her full birth date here (kept out of the public starter file on purpose).'}),
 P('aaron',{given:'Aaron',surname:'Turner',sex:'M',parents:['mark'],order:1,notes:"Mark's son. Mother and dates to add. Birth order to confirm."}),
 P('luc',{given:'Luc',surname:'Turner',sex:'M',parents:['mark'],order:2,notes:"Mark's son (spelt Luc). Mother and dates to add. Birth order to confirm."}),
 P('annie',{given:'Annie',surname:'Pears',sex:'F',deceased:true,parents:['bill','emma-mother'],order:1,notes:'Eldest of the three children. Deceased; dates to add.'}),
 P('tim',{given:'Tim',surname:'Pears',sex:'M',birth:'15 Nov 1956',birthPlace:'Tunbridge Wells, Kent',parents:['bill','emma-mother'],order:2,
   notes:'Novelist. Grew up in Crewe, then Trusham in the Teign Valley, Devon, where his father was rector. Lives in Oxford.'}),
 P('bill',{given:'William Steuart "Bill"',surname:'Pears',sex:'M',birth:'c.1920',death:'1986',deceased:true,parents:['sap','anne-biggins'],spouses:['emma-mother','nancy'],
   notes:'Church of England priest. Read history at Oxford (1939); artillery officer at El Alamein; liaison officer with the Yugoslav partisans 1943–44, later head of the British mission; played rugby for Bath. Industrial chaplain in Crewe, then rector of four Teign Valley parishes and a county councillor. Died of cancer in 1986.\nUncertain: birth year is estimated (c.1919–21).'}),
 P('nancy',{given:'Nancy',surname:'',sex:'F',death:'1986',deceased:true,spouses:['bill'],
   notes:"Bill's second wife and Emma's step-mother. A psychiatrist. Died in 1986, four days apart from Bill.\nSurname to add."}),
 P('emma-mother',{given:'Mother of Annie, Tim & Emma',surname:'(name unknown)',sex:'F',spouses:['bill'],
   notes:"Name not yet known. Married Bill young; she was the daughter of the vicar Bill served as curate (c.1954–55). Later remarried.\nUncertain: family recollection that her father was a Bishop of Worcester — not yet confirmed."}),
 P('sap',{given:'Steuart Arnold',surname:'Pears',sex:'M',birth:'1894',deceased:true,parents:['sdp','margaret-isabel'],spouses:['anne-biggins'],marr:{'anne-biggins':'1916'},
   notes:'From the Pears family pedigree.'}),
 P('anne-biggins',{given:'Anne',surname:'Biggins',sex:'F',deceased:true,spouses:['sap'],marr:{sap:'1916'},notes:"Bill's mother. Married Steuart Arnold Pears in 1916."}),
 P('sdp',{given:'Steuart Durand',surname:'Pears',sex:'M',birth:'c.1859',deceased:true,parents:['acp','amf'],spouses:['margaret-isabel'],marr:{'margaret-isabel':'1893'},
   notes:'Uncertain: birth year unclear on the pedigree scan (perhaps 1859). Married Margaret Isabel in 1893.'}),
 P('margaret-isabel',{given:'Margaret Isabel',surname:'',sex:'F',birth:'1871',deceased:true,spouses:['sdp'],marr:{sdp:'1893'},notes:'Surname not shown on the pedigree scan.'}),
 P('edmund',{given:'Vice-Admiral Sir Edmund Radcliffe',surname:'Pears',sex:'M',birth:'1862',death:'1941',deceased:true,parents:['acp','amf'],
   notes:"Royal Navy. Brother of Steuart Durand Pears, so likely Bill's great-uncle.\nUncertain: link from the pedigree scan and thepeerage.com; treat as likely rather than proven."}),
 P('acp',{given:'Lt-Col Arnold Christian',surname:'Pears',sex:'M',birth:'1811',death:'1891',deceased:true,spouses:['amf'],marr:{amf:'1851'},
   notes:'Married Anne Maria Fry in 1851.'}),
 P('amf',{given:'Anne Maria',surname:'Fry',sex:'F',birth:'1827',death:'1911',deceased:true,spouses:['acp'],marr:{acp:'1851'},
   notes:"Through her the line descends from the Quaker Barclay, Gurney and Fry families (Robert Barclay 'The Apologist'; the Gurneys of Earlham; Elizabeth Fry's family). The full pedigree, back to Scottish and English royal lines, is in Mark's scanned 'Pedigree showing noteworthy ancestors of the family of Pears'."}),
];
