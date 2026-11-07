/** Original user uploads, placed once across the existing public page layouts.
 * Width/height describe the displayed orientation; the files retain original bytes. */
import heroPhotos from './heroPhotos.json';
export type LearningPhotograph = {
 src:string;
 width:number;
 height:number;
 alt:string;
 caption:string;
 objectPosition:string;
};

const photographs = {
 ukraineGroup:{src:'/images/global-learning/ukraine-delegation-2.jpg',width:4464,height:2976,alt:'A group gathered indoors in the Ukraine Delegation photographs.',caption:'Ukraine Delegation · Global perspectives',objectPosition:'50% 42%'},
 brazilGroup:{src:'/images/global-learning/brazil-1.jpg',width:4464,height:2976,alt:'Black-and-white group portrait from the Brazil photographs.',caption:'Brazil · Professional community',objectPosition:'50% 38%'},
 ukraineConversation:{src:'/images/global-learning/ukraine-delegation-1.jpg',width:4464,height:2976,alt:'A small group posing together in the Ukraine Delegation photographs.',caption:'Ukraine Delegation · Connecting across cultures',objectPosition:'46% 38%'},
 brazilExchange:{src:'/images/global-learning/brazil-2.jpg',width:2976,height:4464,alt:'Two participants pictured together at an indoor event in the Brazil photographs.',caption:'Brazil · Professional exchange',objectPosition:'50% 10%'},
 brazilMediation:{src:'/images/global-learning/brazil-3.jpg',width:4464,height:2976,alt:'Two participants beside a mediation event display in the Brazil photographs.',caption:'Brazil · Mediation in practice',objectPosition:'62% 42%'}
} satisfies Record<string,LearningPhotograph>;

const heroOverrides=heroPhotos as {landing?:LearningPhotograph|null;home?:LearningPhotograph|null};

export const LEARNING_PHOTO_PLACEMENTS = {
 landing:{hero:heroOverrides.landing||photographs.ukraineGroup,story:photographs.brazilGroup},
 home:{hero:heroOverrides.home||photographs.brazilExchange,event:photographs.ukraineConversation},
 about:{gallery:photographs.brazilMediation}
} as const;

export type LearningPhotoPage = keyof typeof LEARNING_PHOTO_PLACEMENTS;
type PhotoSlot<Page extends LearningPhotoPage> = keyof typeof LEARNING_PHOTO_PLACEMENTS[Page];

export function learningPhoto<Page extends LearningPhotoPage>(page:Page,slot:PhotoSlot<Page>):LearningPhotograph {
 return LEARNING_PHOTO_PLACEMENTS[page][slot] as LearningPhotograph;
}

/** Spread into an existing AcademyImage without changing its surrounding layout. */
export function learningPhotoProps<Page extends LearningPhotoPage>(page:Page,slot:PhotoSlot<Page>) {
 const photo=learningPhoto(page,slot);
 return {
  src:photo.src,alt:photo.alt,title:photo.caption,width:photo.width,height:photo.height,
  className:'originalLearningPhoto',
  style:{objectFit:'cover' as const,objectPosition:photo.objectPosition,backgroundColor:'#eee7dc'},
  'data-learning-page':page,'data-learning-slot':String(slot)
 };
}
