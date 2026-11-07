import mongoose from 'mongoose';
import {TEAM_CATEGORIES,teamCategories} from '../utils/teamCategories.js';
const schema=new mongoose.Schema({
 name:{type:String,required:true,trim:true}, slug:{type:String,required:true,unique:true,index:true},
 category:{type:String,enum:TEAM_CATEGORIES,default:'faculty',required:true,index:true},
 categories:{type:[String],enum:TEAM_CATEGORIES,default:undefined,validate:{
  validator:v=>v===undefined||(Array.isArray(v)&&v.length>=1&&v.length<=4&&new Set(v).size===v.length),
  message:'Choose one or more valid team categories.'
 }},
 role:{type:String,default:''}, country:{type:String,default:''}, bio:{type:String,default:''},
 image:{type:String,default:'/images/team/faculty-placeholder.jpg'}, imageFileId:{type:String,default:''}, order:{type:Number,default:0},
 imageOriginal:{type:String,default:''},imageOriginalFileId:{type:String,default:null},
 imageEdit:{aspect:String,zoom:Number,x:Number,y:Number,rotation:Number,flipX:Boolean,flipY:Boolean,brightness:Number,contrast:Number},
 active:{type:Boolean,default:true}
},{timestamps:true});
schema.pre('validate',function(){
 // Keep the primary legacy category deterministic for older consumers.
 if(this.isNew || this.isModified('categories') || this.isModified('category')){
  if(this.isModified('category')&&!this.isModified('categories')&&!this.isNew)this.categories=[this.category];
  if(this.categories?.length){const normal=teamCategories(this);if(normal.length===this.categories.length){this.categories=normal;this.category=normal[0];}}
  else if(this.categories===undefined){this.categories=[this.category||'faculty'];}
 }
});
schema.index({active:1,order:1});
schema.index({active:1,categories:1,order:1});
schema.index({imageFileId:1});
export default mongoose.models.TeamMember||mongoose.model('TeamMember',schema);
