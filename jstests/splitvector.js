// -------------------------
//  SPLITVECTOR TEST UTILS
// -------------------------

// -------------------------
// assertChunkSizes verifies that a given 'splitVec' divides the 'test.jstest_splitvector'
// collection in 'maxChunkSize' approximately-sized chunks. Its asserts fail otherwise.
// @param splitVec: an array with keys for field 'x'
//        e.g. [ { x : 1927 }, { x : 3855 }, ...
// @param numDocs: domain of 'x' field 
//        e.g. 20000
// @param maxChunkSize is in MBs.
//
assertChunkSizes = function ( splitVec , numDocs , maxChunkSize , msg ){
    splitVec = [{ x: -1 }].concat( splitVec );
    splitVec.push( { x: numDocs+1 } );
    for ( i=0; i<splitVec.length-1; i++) { 
        min = splitVec[i];
        max = splitVec[i+1];
        size = db.runCommand( { datasize: "test.jstests_splitvector" , min: min , max: max } ).size;
        
        // It is okay for the last chunk to be  smaller. A collection's size does not
        // need to be exactly a multiple of maxChunkSize.
        if ( i < splitVec.length - 2 )
            assert.close( maxChunkSize , size , "A"+i , -3 );
        else
            assert.gt( maxChunkSize , size , "A"+i , msg + "b" );
    }
}


// -------------------------
//  TESTS START HERE
// -------------------------

f = db.jstests_splitvector;
f.drop();

// -------------------------
// Case 1: missing parameters 

assert.eq( false, db.runCommand( { splitVector: "test.jstests_splitvector" } ).ok , "1a" );
assert.eq( false, db.runCommand( { splitVector: "test.jstests_splitvector" , maxChunkSize: 1} ).ok , "1b" );


// -------------------------
// Case 2: missing index

assert.eq( false, db.runCommand( { splitVector: "test.jstests_splitvector" , keyPattern: {x:1} , maxChunkSize: 1 } ).ok , "2");


// -------------------------
// Case 3: empty collection

f.ensureIndex( { x: 1} );
assert.eq( [], db.runCommand( { splitVector: "test.jstests_splitvector" , keyPattern: {x:1} , maxChunkSize: 1 } ).splitKeys , "3");


// -------------------------
// Case 4: uniform collection

f.drop();
f.ensureIndex( { x: 1 } );

var case4 = function() {
    // Get baseline document size
    filler = "";
    while( filler.length < 500 ) filler += "a";
    f.save( { x: 0, y: filler } );
    docSize = db.runCommand( { datasize: "test.jstests_splitvector" } ).size;
    assert.gt( docSize, 500 , "4a" );

    // Fill collection and get split vector for 1MB maxChunkSize
    numDocs = 20000;
    for( i=1; i<numDocs; i++ ){
        f.save( { x: i, y: filler } );
    }
    db.getLastError();
    res = db.runCommand( { splitVector: "test.jstests_splitvector" , keyPattern: {x:1} , maxChunkSize: 1 } );

    // splitVector aims at getting half-full chunks after split
    factor = 0.5; 

    assert.eq( true , res.ok , "4b" );
    assert.close( numDocs*docSize / ((1<<20) * factor), res.splitKeys.length , "num split keys" , -1 );
    assertChunkSizes( res.splitKeys , numDocs, (1<<20) * factor , "4d" );
}
case4();

// -------------------------
// Case 5: limit number of split points

f.drop();
f.ensureIndex( { x: 1 } );

var case5 = function() {
    // Fill collection and get split vector for 1MB maxChunkSize
    numDocs = 10000;
    for( i=1; i<numDocs; i++ ){
        f.save( { x: i, y: filler } );
    }
    db.getLastError();
    res = db.runCommand( { splitVector: "test.jstests_splitvector" , keyPattern: {x:1} , maxChunkSize: 1 , maxSplitPoints: 1} );

    assert.eq( true , res.ok , "5a" );
    assert.eq( 1 , res.splitKeys.length , "5b" );
}
case5();

// -------------------------
// Case 6: limit number of objects in a chunk

f.drop();
f.ensureIndex( { x: 1 } );

var case6 = function() {
    // Fill collection and get split vector for 1MB maxChunkSize
    numDocs = 10000;
    for( i=1; i<numDocs; i++ ){
        f.save( { x: i, y: filler } );
    }
    db.getLastError();
    res = db.runCommand( { splitVector: "test.jstests_splitvector" , keyPattern: {x:1} , maxChunkSize: 1 , maxChunkObjects: 500} );

    assert.eq( true , res.ok , "6a" );
    assert.eq( 19 , res.splitKeys.length , "6b" );
}
case6();

// -------------------------
// Case 7: enough occurances of min key documents to pass the chunk limit
// [1111111111111111,2,3)

f.drop();
f.ensureIndex( { x: 1 } );

var case7 = function() {
    // Fill collection and get split vector for 1MB maxChunkSize
    numDocs = 2100;
    for( i=1; i<numDocs; i++ ){
        f.save( { x: 1, y: filler } );
    }

    for( i=1; i<10; i++ ){
        f.save( { x: 2, y: filler } );
    }
    db.getLastError();
    res = db.runCommand( { splitVector: "test.jstests_splitvector" , keyPattern: {x:1} , maxChunkSize: 1 } );

    assert.eq( true , res.ok , "7a" );
    assert.eq( 2 , res.splitKeys[0].x, "7b");
}
case7();

// -------------------------
// Case 8: few occurrances of min key, and enough of some other that we cannot split it
// [1, 22222222222222, 3)

f.drop();
f.ensureIndex( { x: 1 } );

var case8 = function() {
    for( i=1; i<10; i++ ){
        f.save( { x: 1, y: filler } );
    }

    numDocs = 2100;
    for( i=1; i<numDocs; i++ ){
        f.save( { x: 2, y: filler } );
    }

    for( i=1; i<10; i++ ){
        f.save( { x: 3, y: filler } );
    }

    db.getLastError();
    res = db.runCommand( { splitVector: "test.jstests_splitvector" , keyPattern: {x:1} , maxChunkSize: 1 } );

    assert.eq( true , res.ok , "8a" );
    assert.eq( 2 , res.splitKeys.length , "8b" );
    assert.eq( 2 , res.splitKeys[0].x , "8c" );
    assert.eq( 3 , res.splitKeys[1].x , "8d" );
}
case8();

// -------------------------
// Case 9: splitVector "force" mode, where we split (possible small) chunks in the middle
//

f.drop();
f.ensureIndex( { x: 1 } );

var case9 = function() {
    f.save( { x: 1 } );
    f.save( { x: 2 } );
    f.save( { x: 3 } );
    db.getLastError();

    assert.eq( 3 , f.count() );
    print( f.getFullName() )

    res = db.runCommand( { splitVector: f.getFullName() , keyPattern: {x:1} , force : true } );

    assert.eq( true , res.ok , "9a" );
    assert.eq( 1 , res.splitKeys.length , "9b" );
    assert.eq( 2 , res.splitKeys[0].x , "9c" );

    if ( db.runCommand( "isMaster" ).msg != "isdbgrid" ) {
        res = db.adminCommand( { splitVector: "test.jstests_splitvector" , keyPattern: {x:1} , force : true } );
        
        assert.eq( true , res.ok , "9a: " + tojson(res) );
        assert.eq( 1 , res.splitKeys.length , "9b: " + tojson(res) );
        assert.eq( 2 , res.splitKeys[0].x , "9c: " + tojson(res) );
    }
}
case9();

// -------------------------
// Repeat all cases using prefix shard key.
//

f.drop();
f.ensureIndex( { x: 1, y: 1 } );
case4();

f.drop();
f.ensureIndex( { x: 1, y: 1 } );
case5();

f.drop();
f.ensureIndex( { x: 1, y: 1 } );
case6();

f.drop();
f.ensureIndex( { x: 1, y: 1 } );
case7();

f.drop();
f.ensureIndex( { x: 1, y: 1 } );
case8();

f.drop();
f.ensureIndex( { x: 1, y: 1 } );
case9();

print("PASSED");
