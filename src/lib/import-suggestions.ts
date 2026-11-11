import { z } from 'zod';

export const categorySuggestionInput=z.object({
 pharmacyId:z.string().uuid(),
 unmatchedCategory:z.string().trim().min(1).max(200),
 details:z.string().trim().min(1).max(4000),
});
export const categorySuggestionOutput=z.object({categoryId:z.string().nullable(),reason:z.string().min(1).max(500)});
export function checkedCategorySuggestion(value:unknown,categories:{id:string;name:string}[]) {
 const parsed=categorySuggestionOutput.parse(value);
 if(parsed.categoryId===null)return {category:null,reason:parsed.reason};
 const category=categories.find(c=>c.id===parsed.categoryId);
 if(!category)throw new Error('The suggested category is not available in this workspace.');
 return {category,reason:parsed.reason};
}