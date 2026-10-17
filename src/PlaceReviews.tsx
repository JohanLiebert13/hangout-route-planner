import React from 'react';
import {View,Text,Pressable,Linking,StyleSheet} from 'react-native';
import type {PlaceReview} from './types';
export default function PlaceReviews({review,name,onError}:{review?:PlaceReview;name:string;onError?:()=>void}) {
  if(!review)return <Text style={s.fine}>Ratings unavailable for this saved route.</Text>;
  const mock=review.source==='mock',color=review.rating>=4.5?'#edce8b':review.rating>=4?'#cce6a1':review.rating>=3.5?'#d7bd99':'#e3a99c';
  return <View style={s.box} accessibilityLabel={name+' rating: '+review.rating.toFixed(1)+' out of 5. '+(mock?'Simulated demo rating.':'Online rating snapshot.')}>
    <View style={s.row}><Text style={[s.star,{color}]}>★</Text><Text style={[s.value,{color}]}>{review.rating.toFixed(1)}<Text style={s.outOf}> / 5</Text></Text><View style={[s.badge,!mock&&s.online]}><Text style={s.badgeText}>{mock?'DEMO RATING':'ONLINE SNAPSHOT'}</Text></View></View>
    <Text style={s.summary}>{review.summary}</Text>
    {mock?<Text style={s.fine}>Simulated score & feedback, not customer reviews.</Text>:<>
      <Pressable accessibilityRole="link" accessibilityLabel={'Read '+name+' reviews on '+review.sourceName} onPress={event=>{event.stopPropagation();if(review.sourceUrl)Linking.openURL(review.sourceUrl).catch(()=>onError?.());}}><Text style={s.source}>{review.sourceName}{review.reviewCount!==undefined?' · '+review.reviewCount.toLocaleString('en')+' reviews':''} ↗</Text></Pressable>
      <Text style={s.fine}>Researched {review.researchedOn} · may have changed</Text>
    </>}
  </View>;
}
const s=StyleSheet.create({box:{marginTop:12,padding:11,borderRadius:10,backgroundColor:'#172219',borderWidth:1,borderColor:'#35422e'},row:{flexDirection:'row',alignItems:'center',gap:5,flexWrap:'wrap'},star:{fontSize:18},value:{fontSize:17,fontWeight:'700'},outOf:{fontSize:10,color:'#94a48d',fontWeight:'400'},badge:{marginLeft:3,paddingVertical:4,paddingHorizontal:6,borderRadius:5,backgroundColor:'#38412b'},online:{backgroundColor:'#263e36'},badgeText:{fontSize:7,letterSpacing:.6,color:'#d2dec3',fontWeight:'700'},summary:{fontSize:10,color:'#c1cfb7',lineHeight:16,marginTop:7},fine:{fontSize:8,color:'#8b9d80',lineHeight:13,marginTop:6},source:{fontSize:9,color:'#c6df9f',marginTop:8,lineHeight:15}});
