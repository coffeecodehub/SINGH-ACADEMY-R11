import mongoose from 'mongoose';
import {pricingSchema,countryPriceSchema} from './Course.js';
const schema=new mongoose.Schema({
 title:{type:String,required:true,trim:true},slug:{type:String,required:true,unique:true,trim:true},
 description:String,shortDescription:String,thumbnail:String,thumbnailFileId:{type:mongoose.Schema.Types.ObjectId,default:null},
 published:{type:Boolean,default:false},order:{type:Number,default:0},currency:{type:String,enum:['USD'],default:'USD'},
 price:{type:Number,min:0,default:0},accessMonths:{type:Number,min:1,max:120,default:1},countryPrices:{type:[countryPriceSchema],default:[]},includeBaseOffer:{type:Boolean,default:false},pricing:{type:[pricingSchema],default:[]},
 archivedAt:{type:Date,default:null}
},{timestamps:true});
schema.index({published:1,order:1});
schema.index({thumbnailFileId:1});
export default mongoose.models.Section||mongoose.model('Section',schema);
