import test from 'node:test'
import assert from 'node:assert/strict'
import {inferCourseType} from '../src/lib/gpxRaceRoute.mjs'
test('classifies clearly distinct GPS topologies without asserting ambiguous routes',()=>{
 const a=[51,8],b=[51.01,8],c=[51.02,8],d=[51.02,8.02],e=[51,8.02]
 assert.equal(inferCourseType([a,b,c]),'point_to_point')
 assert.equal(inferCourseType([a,b,c,b,a]),'out_and_back')
 assert.equal(inferCourseType([a,c,d,e,a]),'loop')
 assert.equal(inferCourseType([a,a,a]),null)
})
