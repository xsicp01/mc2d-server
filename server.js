var util = require("util"),
	io = require("socket.io"),
	pg = require('pg'), 
	request = require("request"),
	sha256 = require("sha256");

var socket, players;

function validateString(str) {
	return JSON.stringify(str).replace(/[^A-Za-z0-9]/g, '')
}


function init() {
	players = [];
	resetTimer=0;
	ip = process.env.IP || "0.0.0.0";
	var port = process.env.PORT-1 || 8079;
	port++;//workaround for server port bug


	if(process.env.DATABASE_URL) { // DB 
		pg.connect(process.env.DATABASE_URL,function(err,pgClient,done) {
        if(err){
            util.log("Not able to connect: "+ err);
        } 
        pgClient.query('SELECT * FROM map', function(err,result) {
            if(err || result.rows.length<10){
            	if(err)
                	util.log(err);
		 		mapGenerator.generate();
		 		if(map) {
					util.log("Map was generated ")
					for(var a=0;a<map.length;a++) {
						var columnsStack="(y";
						for(var x=0;x<1000;x++) {
							columnsStack+=",_"+x;
						}
						columnsStack+=")";

						var queryStack="("+a;
						for(var b=0;b<map[a].length;b++) {
							queryStack+=","+map[a][b];
						}
						queryStack+=")";

						pgClient.query("INSERT INTO map "+columnsStack+" VALUES"+queryStack, function(err) {
							if(err) {
								util.log("FAILED writing map part to database: " + err)
							} else {
								util.log("Writen map part to database")
							}
						})
					}	
				}
            } else {
            	util.log("Started map loading")
	          	pgClient.query("SELECT * FROM map", function(err, result) {
					if(err) {
						util.log("FAILED writing map part to database: " + err)
					} else if(result) {
						map = [[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]];
						
						for(var a=0; a<result.rows.length; a++) {
							for (var b=0; b<1000;b++) {
								map[result.rows[a].y][b]=result.rows[a]["_"+b];
							}
							util.log("Loaded map part")
						}
						util.log("Map was loaded successfully")
					}
				})
            }
		done();
       });
    });
	} else {
		mapGenerator.generate();
	}


	socket = io.listen(port, ip, function() {
    	console.log('Server is listening on port '+port);
	});
	socket.configure(function() {
    	socket.set("transports", ["websocket"]);
    	socket.set("log level", 2);
	});
    socket.sockets.on("connection", onSocketConnection);
	resetMessagesPerMinutes = setInterval(function() {
		for(var a=0;a<players.length;a++) {
			if(players[a].messagesPerMinute < 25)
				players[a].messagesPerMinute=0;
		}
	},60000);
}

function giveItemToBestInventoryPosition(item, count, id) {
	for(var a=0;a < playerById(id).inventory.hotbar.length; a++) {
		if(playerById(id).inventory.hotbar[a].item == item)
			players[players.indexOf(playerById(id))].inventory.hotbar[a].count += count;
			util.log("1");	
			return;
	}
	for (var m=0;m < playerById(id).inventory.inventory.length; m++) {
		for(var a=0; a< m.count;a++) {
			if(playerById(id).inventory.inventory[m][a].item == item)
				players[players.indexOf(playerById(id))].inventory.inventory[m][a].count += count;	
			util.log("2");
				return;	
		}				
	}
	for(var a=0;a < playerById(id).inventory.hotbar.length; a++) {
		if(playerById(id).inventory.hotbar[a].item == undefined) {
			players[players.indexOf(playerById(id))].inventory.hotbar[a].count = count;
			players[players.indexOf(playerById(id))].inventory.hotbar[a].item = item;
			util.log("3");
			return;
		}
	}
	for (var m=0;m < playerById(id).inventory.inventory.length; m++) {
		for(var a=0; a< m.count;a++) {
			if(playerById(id).inventory.inventory[m][a].item == undefined) {
				players[players.indexOf(playerById(id))].inventory.inventory[m][a].count = count;
				players[players.indexOf(playerById(id))].inventory.inventory[m][a].item = item;	
				util.log("4");	
				return;	
			}
		}				
	}
}

function drop(item1, count1, condition, item2, count2, activeItem) {
	count1 = count1 || 1;
	count2 = count2 || 1;
	if(activeItem != undefined && condition != undefined && items[activeItem].type == condition && item2 != undefined) {
		return {item: item2, count: count2};
	} else if(item1 != undefined){
		return {item: item1, count: count1};
	} else {
		return {item: undefined, count: 0};
	}
}

function invSpace(item, count) {
	this.item = item;
	this.count = count || 0;
} 

var inventoryPreset = {
	armor: [new invSpace(), new invSpace(), new invSpace(), new invSpace()],
	inventory: [[new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace()],
				[new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace()],
				[new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace()]
				],
	hotbar: [new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace(), new invSpace()]			
}
var craftingPreset=[
		new invSpace(),
		new invSpace(), 
		new invSpace(), 
		new invSpace(),
		new invSpace()]; // crafting result field
var craftingTablePreset =[
		new invSpace(),new invSpace(),new invSpace(),
		new invSpace(),new invSpace(),new invSpace(),
		new invSpace(),new invSpace(),new invSpace(), new invSpace()]

var items = [
	{name: "stone", durability: 500, stack: 64, x:13, favType:"pickaxe", drop: [undefined, 0, "pickaxe", 1]},                            					    
	{name: "cobblestone", durability: 500, stack: 64, x:7, favType:"pickaxe", drop: [undefined, 0, "pickaxe", 1]},											
	{name: "wood", durability: 300, stack: 64, x:11, favType: "axe", smelting: 1000, drop: [2]},									
	{name: "leaves", durability: 50, stack: 64, x:12, favType:"scissors", smelting: 300, drop: [undefined, 0, "scissors", 3]},								
	{name: "grass", durability: 100, stack: 64, x:10, favType:"scissors", favType2: "shovel", drop: [5, 1, "scissors", 4]},							
	{name: "dirt", durability: 100, stack: 64, x:9, favType:"shovel", drop: [5]},											
	{name: "bedrock", durability: Infinity, drop: [undefined]},																		
	{name: "iron ore", durability: 700, stack: 64, x:3, favType:"pickaxe", drop: [undefined, 0, "pickaxe", 7]},													
	{name: "coal ore", durability: 600, stack: 64, x:0, favType:"pickaxe", drop: [undefined, 0, "pickaxe", 51]},		 										
	{name: "diamond ore", durability: 1000, stack: 64, x:1, favType:"pickaxe", drop: [undefined, 0, "pickaxe", 50]},  										
	{name: "gold ore", durability: 800, stack: 64, x:2, favType:"pickaxe", drop: [undefined, 0, "pickaxe", 10]},			 										
	{name: "wooden planks", durability: 200, stack: 64, x:5, favType: "axe", smelting: 500, drop: [11]},								
	{name: "crafting table", durability: 200, stack: 64, x:8, favType: "axe", active:"crafting", smelting: 1000, drop: [12]},			
	{name: "furnace", durability: 500, stack: 64, x:4, favType: "pickaxe", active:"furnace", drop: [undefined, 0, "pickaxe", 13]},								
	{name: "Leather helmet", stack: 1, x:0, y:0, durability: 200, type: "helmet"},
	{name: "Chain helmet", stack: 1, x:1, y:0, durability: 400, type: "helmet"},
	{name: "Iron helmet", stack: 1, x:2, y:0, durability: 600, type: "helmet"},
	{name: "Diamond helmet", stack: 1, x:3, y:0, durability: 800, type: "helmet"},
	{name: "Golden helmet", stack: 1, x:4, y:0, durability: 1000, type: "helmet"},
	{name: "Leather chestplate", stack: 1, x:0, y:1, durability: 200, type: "chestplate"},
	{name: "Chain chestplate", stack: 1, x:1, y:1, durability: 400, type: "chestplate"},
	{name: "Iron chestplate", stack: 1, x:2, y:1, durability: 600, type: "chestplate"},
	{name: "Diamond chestplate", stack: 1, x:3, y:1, durability: 800, type: "chestplate"},
	{name: "Golden chestplate", stack: 1, x:4, y:1, durability: 1000, type: "chestplate"},
	{name: "Leather trousers", stack: 1, x:0, y:2, durability: 200, type: "trousers"},
	{name: "Chain trousers", stack: 1, x:1, y:2, durability: 400, type: "trousers"},
	{name: "Iron trousers", stack: 1, x:2, y:2, durability: 600, type: "trousers"},
	{name: "Diamond trousers", stack: 1, x:3, y:2, durability: 800, type: "trousers"},
	{name: "Golden trousers", stack: 1, x:4, y:2, durability: 1000, type: "trousers"},
	{name: "Leather shoes", stack: 1, x:0, y:3, durability: 200, type: "shoes"},
	{name: "Chain shoes", stack: 1, x:1, y:3, durability: 400, type: "shoes"},
	{name: "Iron shoes", stack: 1, x:2, y:3, durability: 600, type: "shoes"},
	{name: "Diamond shoes", stack: 1, x:3, y:3, durability: 800, type: "shoes"},
	{name: "Golden shoes", stack: 1, x:4, y:3, durability: 1000, type: "shoes"},
	{name: "Scissors", stack:1, x:13, y:5, durability: 200, type: "scissors", multiplier:2},
	{name: "Wood pickaxe", stack:1, x:0, y:6, durability: 500, type: "pickaxe", multiplier:6},
	{name: "Stone pickaxe", stack:1, x:1, y:6, durability: 500, type: "pickaxe", multiplier:8},
	{name: "Iron pickaxe", stack:1, x:2, y:6, durability: 500, type: "pickaxe", multiplier:10},
	{name: "Diamond pickaxe", stack:1, x:3, y:6, durability: 500, type: "pickaxe", multiplier:12},
	{name: "Gold pickaxe", stack:1, x:4, y:6, durability: 500, type: "pickaxe", multiplier:12},
	{name: "Wood axe", stack:1, x:0, y:7, durability: 500, type: "axe", multiplier:3},
	{name: "Stone axe", stack:1, x:1, y:7, durability: 500, type: "axe", multiplier:4},
	{name: "Iron axe", stack:1, x:2, y:7, durability: 500, type: "axe", multiplier:5},
	{name: "Diamond axe", stack:1, x:3, y:7, durability: 500, type: "axe", multiplier:6},
	{name: "Gold axe", stack:1, x:4, y:7, durability: 500, type: "axe", multiplier:6},
	{name: "Wooden shovel", stack:1, x:0, y:5, durability: 50, type: "shovel", multiplier:2},
	{name: "Stone shovel", stack:1, x:1, y:5, durability: 200, type: "shovel", multiplier:3},
	{name: "Iron shovel", stack:1, x:2, y:5, durability: 500, type: "shovel", multiplier:4},
	{name: "Diamond shovel", stack:1, x:3, y:5, durability: 1000, type: "shovel", multiplier:5},
	{name: "Gold shovel", stack:1, x:4, y:5, durability: 100, type: "shovel", multiplier:5},
	{name: "Diamond", stack: 64, x:7, y:3, type: "item"},
	{name: "Coal", stack: 64, x:7, y:0, type: "item", smelting: 4000},
	{name: "Iron ingot", stack: 64, x:7, y:1, type: "item"},
	{name: "Gold ingot", stack: 64, x:7, y:2, type: "item"},
	{name: "Stick", stack: 64, x:5, y:3, type: "item", smelting: 50},
]

//map generator start

function randomRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function customChance(chance1, chance2, chance3) {
	var random = randomRange(1, chance1+chance2+chance3)
	if(random <= chance1) {
		return 0;
	} else if(random <= chance1+chance2) {
		return 1;
	}else
		return 2;
}
function mapGeneratorConstructor() {
	this.mapLength=1000;
	this.terainBaseHeight = 40;
	this.terainHeight=[];
	this.generate = function(){
		for(var a=0;a<100;a++) {
			this.terainHeight[a]=this.terainBaseHeight;
		}
		var actionsHistory=[];
		var adjustedTerain=0;
		while(true){
			var areaLength=randomRange(5,10);
			action = customChance(1,2,1);

			if(adjustedTerain+areaLength>this.mapLength-1){
				areaLength=this.mapLength-adjustedTerain-1;
			}
			if(action==0) {
				for(var m=1;m<areaLength+1;m++) {
					if(this.terainHeight[adjustedTerain+m-1]-2 > 20){
						this.terainHeight[adjustedTerain+m]=this.terainHeight[adjustedTerain+m-1]-customChance(4,5,1);
					}else {
						areaLength=m-1;
						break;
					}
				}
			}else if(action==1) {
				for(var m=1;m<areaLength+1;m++) {
					this.terainHeight[adjustedTerain+m]=this.terainHeight[adjustedTerain+m-1]+customChance(1,9,2)-1;
				}
			}else if(action==2) {
				for(var m=1;m<areaLength+1;m++) {
					if(this.terainHeight[adjustedTerain+m-1]+2 < 60){
						this.terainHeight[adjustedTerain+m]=this.terainHeight[adjustedTerain+m-1]+customChance(4,5,1);
					}else {
						areaLength=m-1;
						break;
					}
				}
			}
			adjustedTerain+=areaLength
			if(adjustedTerain==this.mapLength-1)
				break;
		}
		map = [[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]];
		for(var a=0; a<map.length;a++) {
			for(var b=0; b<this.mapLength;b++) {
				if (a>map.length-4) {
					map[a][b]=6;
				}else if(a>this.terainHeight[b]+3){
					if(randomRange(0, 100) || a<5 || b<5){
						map[a][b]=0;
					}else{
						var randomNum=randomRange(0,3)
						if(randomNum==0){
								map[a][b]=7
							if(randomRange(0,2))
								map[a][b-1]=7
							if(randomRange(0,2))
								map[a-1][b]=7
							if(randomRange(0,2))
								map[a-1][b-1]=7
							if(randomRange(0,2))
								map[a][b-2]=7
							if(randomRange(0,2))
								map[a-2][b]=7
						} else if(randomNum==1){
								map[a][b]=8
							if(randomRange(0,2))
								map[a][b-1]=8
							if(randomRange(0,2))
								map[a-1][b]=8
							if(randomRange(0,2))
								map[a-1][b-1]=8
							if(randomRange(0,2))
								map[a][b-2]=8
							if(randomRange(0,2))
								map[a-2][b]=8
						}if(randomNum==2){
								map[a][b]=9
							if(randomRange(0,2))
								map[a][b-1]=9
							if(randomRange(0,2))
								map[a-1][b]=9
							if(randomRange(0,2))
								map[a-1][b-1]=9
							if(randomRange(0,2))
								map[a][b-2]=9
							if(randomRange(0,2))
								map[a-2][b]=9
						}if(randomNum==3){
								map[a][b]=10
							if(randomRange(0,2))
								map[a][b-1]=10
							if(randomRange(0,2))
								map[a-1][b]=10
							if(randomRange(0,2))
								map[a-1][b-1]=10
							if(randomRange(0,2))
								map[a][b-2]=10
							if(randomRange(0,2))
								map[a-2][b]=10
						}
					}
				}else if(a>this.terainHeight[b]){
					map[a][b]=5;
				}else if(a>this.terainHeight[b]-1){
					map[a][b]=4;
				}else
					map[a][b]=-1;
			}
		}
		var treeCount=randomRange(this.mapLength/50,this.mapLength/20)
		for(var a=0;a<treeCount;a++) {
			var treeArea = Math.floor(this.mapLength/treeCount)
			var treePosition=randomRange(a*treeArea+3, (a+1)*treeArea-3)
			if(!randomRange(0,4)){
				map[this.terainHeight[treePosition]-1][treePosition]=2
				map[this.terainHeight[treePosition]-2][treePosition]=3
				map[this.terainHeight[treePosition]-2][treePosition+1]=3
				map[this.terainHeight[treePosition]-2][treePosition-1]=3
				map[this.terainHeight[treePosition]-3][treePosition]=3
				map[this.terainHeight[treePosition]-3][treePosition+1]=3
				map[this.terainHeight[treePosition]-3][treePosition-1]=3
			} else if(randomRange(0,2)){
				map[this.terainHeight[treePosition]-1][treePosition]=2
				map[this.terainHeight[treePosition]-2][treePosition]=2
				map[this.terainHeight[treePosition]-3][treePosition]=3
				map[this.terainHeight[treePosition]-3][treePosition+1]=3
				map[this.terainHeight[treePosition]-3][treePosition-1]=3
				map[this.terainHeight[treePosition]-4][treePosition]=3
				map[this.terainHeight[treePosition]-4][treePosition+1]=3
				map[this.terainHeight[treePosition]-4][treePosition-1]=3
			} else {
				map[this.terainHeight[treePosition]-1][treePosition]=2
				map[this.terainHeight[treePosition]-2][treePosition]=2
				map[this.terainHeight[treePosition]-3][treePosition]=2
				map[this.terainHeight[treePosition]-4][treePosition]=3
				map[this.terainHeight[treePosition]-4][treePosition+1]=3
				map[this.terainHeight[treePosition]-4][treePosition-1]=3
				map[this.terainHeight[treePosition]-5][treePosition]=3
				map[this.terainHeight[treePosition]-5][treePosition+1]=3
				map[this.terainHeight[treePosition]-5][treePosition-1]=3
			}
		}
	}
}
mapGenerator = new mapGeneratorConstructor();

//Map generator end

function Player(gtX, gtY, gtID, gtName, gtInv, gtRole, gtClient, gtCrafting) {
	this.id = gtID,
	this.name = gtName,
	this.x = gtX,
	this.y = gtY;
	this.inventory = gtInv;
	this.messagesPerMinute=0;
	this.role = gtRole;
	this.client = gtClient;
	this.crafting = gtCrafting;

}

function playerById(id) {
    for (var i = 0; i < players.length; i++) {
        if (players[i].id == id)
            return players[i];
    };
}

function playerByName(name) {
    for (var i = 0; i < players.length; i++) {
        if (players[i].name == name)
            return players[i];
    };
}

function onSocketConnection(client) {
    util.log("New player has connected: "+client.id);
	client.salt=sha256(Math.random()+"");
	client.emit("salt", client.salt)
    client.on("new player", onNewPlayer);
};

function onClientDisconnect() {
    util.log("Player has disconnected: "+this.id);
	var removePlayer = playerById(this.id);

	if (!removePlayer) {
	    util.log("Player not found: "+this.id);
	    return;
	};

	this.broadcast.emit("new message", {name: "[SERVER]", message: "Player "+playerById(this.id).name+" has disconnected"})
	players.splice(players.indexOf(removePlayer), 1);
	this.broadcast.emit("remove player", {id: this.id});
};

function onNewPlayer(data) {
	var newInv=inventoryPreset;
    var newCrafting = craftingPreset;
	var role=1;
	var client=this;
	util.log("Player "+validateString(data.name)+" send authorization token")
	request.post({url:'http://mc2d.herokuapp.com/index.php', form: {name: validateString(data.name), token: data.token, salt: this.salt}}, function(err,httpResponse,body){
		if(err) {
			util.log("Login server offline")
		}
		if(body == "true" && !playerByName(validateString(data.name))) {
			pg.connect(process.env.DATABASE_URL,function(err,pgClient,done) {
       	 		if(err){
            		util.log("Not able to connect: "+ err);
            		return;
        		} 
        		pgClient.query("SELECT * FROM users WHERE name='"+validateString(data.name)+"'", function(err,result) {
        			if(result.rows[0]) {
        				role=result.rows[0].role|0;
        				newInv = JSON.parse(result.rows[0].inventory);
        				newCrafting = JSON.parse(result.rows[0].crafting);
        				if(role == 0) {
							util.log("Player "+validateString(data.name)+" is banned");
							client.emit("disconnect", "You are banned")
							return;
						}
        				client.emit("inventory", result.rows[0]);
        			} else {
	            		util.log("Player "+validateString(data.name)+" is new here!");
	            		pgClient.query("INSERT INTO users(name, role, inventory, crafting) VALUES ('"+validateString(data.name)+"',1 ,'"+JSON.stringify(inventoryPreset)+"', '"+JSON.stringify(craftingPreset)+"')", function(err) {
	            			if(err) {
	            				util.log("Failed creating player profile");
	            				return;
	            			}
	            		})
        			}
        			client.emit("new map", map)
				    client.on("disconnect", onClientDisconnect);
				    client.on("move player", onMovePlayer);
				    client.on("map edit", onMapEdit);
				    client.on("new message", onNewMessage);
				    client.on("block breaking", onBlockBreaking);
				    client.on("move item", onMoveItem);
					util.log("Player "+validateString(data.name)+" authorized successfully")
					client.broadcast.emit("new message", {name: "[SERVER]", message: "Player "+data.name+" connected to the server"})
					client.emit("new message", {name: "[SERVER]", message: "Welcome to the server"})
					var newPlayer = new Player(0, 0, client.id, validateString(data.name), newInv, role, client, newCrafting);
					client.broadcast.emit("new player", {id: parseInt(newPlayer.id), x: parseInt(newPlayer.x), y: parseInt(newPlayer.y), name: validateString(newPlayer.name)});
					var existingPlayer;
					for (var i = 0; i < players.length; i++) {
				    	existingPlayer = players[i];
				    	client.emit("new player", {id: parseInt(existingPlayer.id), x: parseInt(existingPlayer.x), y: parseInt(existingPlayer.y), name: validateString(existingPlayer.name)});
					};
					players.push(newPlayer);
        		})
			done();
        	})
		} else {
			util.log("Player "+validateString(data.name)+" authorization failed")
			client.emit("disconnect", "Your token is invalid(If the problem persist, try restarting the game)")
			client.disconnect(0)
		}
    })
};

function onNewMessage(data) {
	var sender = this;
	util.log(data);
	if(data[0] == "/") {
		var data = validateString(data).split("/")[1]
		var command = validateString(data).split(" ")[0]
		var argument = validateString(data).split(" ")[1]
		switch(command) {
			case "ban":
				if(playerById(sender.id).role > 2) {
					if(process.env.DATABASE_URL)
						pg.connect(process.env.DATABASE_URL,function(err,pgClient,done) {
							if(err) {
								sender.emit("new message", {name: "[SERVER]", message: "Something went wrong, please try again later"});
								return;
							}
							pgClient.query("SELECT role FROM users WHERE name='"+validateString(argument)+"'", function(err, result) { 
								if(result){
									if(result && result.rows[0].role < playerById(sender.id).role) {
										pgClient.query("UPDATE users SET role=0 WHERE name="+validateString(argument), function(err) {
											if(err) {
												sender.emit("new message", {name: "[SERVER]", message: "Unknown error"})
											} else {
												if(playerByName(argument)){
													playerByName(argument).client.broadcast.emit("remove player", {id: playerByName(argument).id});
													var removePlayer = playerByName(argument);
													if (!removePlayer) {
													    util.log("Player not found: "+argument);
													    return;
													};

													playerByName(argument).client.emit("disconnect", "You were banned from the server");
													playerByName(argument).client.disconnect(0);
													players.splice(players.indexOf(removePlayer), 1);
												sender.broadcast.emit("new message", {name: "[SERVER]", message: "Player "+argument+" was banned by "+playerById(sender.id).name})
												sender.emit("new message", {name: "[SERVER]", message: "Successfully banned "+argument})
												}
											}
										})
									} else {
										sender.emit("new message", {name: "[SERVER]", message: "You can't ban this player"})	
									}
								} else {
									sender.emit("new message", {name: "[SERVER]", message: "This player doesn't exist"})
									return;
								}
							});
						done();
						})
				} else {
					this.emit("new message", {name: "[SERVER]", message: "You don't have permission to execute this command"})
				}
				break;
			case "unban":
				if(playerById(sender.id).role > 2) {
					if(process.env.DATABASE_URL)
						pg.connect(process.env.DATABASE_URL,function(err,pgClient,done) {
							if(err) {
								sender.emit("new message", {name: "[SERVER]", message: "Something went wrong, please try again later"});
								return;
							}
							pgClient.query("SELECT role FROM users WHERE name="+validateString(argument), function(err, result) { 
								if(result && result.rows[0].role == 0){
									pgClient.query("UPDATE users SET role=0 WHERE name='"+validateString(argument)+"'", function(err) {
										if(err) {
											sender.emit("new message", {name: "[SERVER]", message: "Unknown error"})
										} else {
											sender.emit("new message", {name: "[SERVER]", message: "Successfully unbanned "+argument})
										}
									})
								} else if(result) {
									sender.emit("new message", {name: "[SERVER]", message: "This player is not banned"})
								}else {
									sender.emit("new message", {name: "[SERVER]", message: "This player doesn't exist"})
									return;
								}
							});
						done();
						})
				} else {
					this.emit("new message", {name: "[SERVER]", message: "You don't have permission to execute this command"})
				}
				break;
			case "promote":
				if(playerById(sender.id).role > 2) {
					if(process.env.DATABASE_URL)
						pg.connect(process.env.DATABASE_URL,function(err,pgClient,done) {
							if(err) {
								sender.emit("new message", {name: "[SERVER]", message: "Something went wrong, please try again later"});
								return;
							}
							pgClient.query("SELECT role FROM users WHERE name="+validateString(argument), function(err, result) { 
								if(result && result.rows[0].role+1 < playerById(sender.id).role){
									pgClient.query("UPDATE users SET role="+parseInt(result.rows[0].role+1)+" WHERE name='"+validateString(argument)+"'", function(err) {
										if(err) {
											sender.emit("new message", {name: "[SERVER]", message: "Unknown error"})
										} else {
											players[players.indexOf(playerByName(argument))].role++;
											sender.emit("new message", {name: "[SERVER]", message: "Successfully promoted "+argument})
											sender.broadcast.emit("new message", {name: "[SERVER]", message: "Player "+argument+" was promoted by "+playerById(sender.id).name})
										}
									})
								} else if(result) {
									sender.emit("new message", {name: "[SERVER]", message: "You can't promote this player"})
									return;
								} else {
									sender.emit("new message", {name: "[SERVER]", message: "This player doesn't exist"})
									return;
								}
							});
						done();
						})
				} else {
					this.emit("new message", {name: "[SERVER]", message: "You don't have permission to execute this command"})
				}
				break;
			case "demote":
				if(playerById(sender.id).role > 2) {
					if(process.env.DATABASE_URL)
						pg.connect(process.env.DATABASE_URL,function(err,pgClient,done) {
							if(err) {
								sender.emit("new message", {name: "[SERVER]", message: "Something went wrong, please try again later"});
								return;
							}
							pgClient.query("SELECT role FROM users WHERE name='"+validateString(argument)+"'", function(err, result) { 
								if(result && result.rows[0].role < playerById(sender.id).role && result.rows[0].role>1 && playerById(sender.id).name != argument){
									pgClient.query("UPDATE "+validateString(argument)+" SET id="+parseInt(result.rows[0].role-1)+" WHERE y=5", function(err) {
										if(err) {
											sender.emit("new message", {name: "[SERVER]", message: "Unknown error"})
										} else {
											players[players.indexOf(playerByName(argument))].role--;
											sender.emit("new message", {name: "[SERVER]", message: "Successfully demoted "+argument})
												sender.broadcast.emit("new message", {name: "[SERVER]", message: "Player "+argument+" was demoted by "+playerById(sender.id).name})
										}
									})
								} else if(result) {
									sender.emit("new message", {name: "[SERVER]", message: "You can't demote this player"})
									return;
								} else {
									sender.emit("new message", {name: "[SERVER]", message: "This player doesn't exist"})
									return;
								}
							});
						done();
						})
				} else {
					this.emit("new message", {name: "[SERVER]", message: "You don't have permission to execute this command"})
				}
				break;
			case "kick":
				var findPlayer = playerById(sender.id);
				if(findPlayer && findPlayer.role > 2) {
					if(playerByName(argument) && playerByName(argument).role < playerById(sender.id).role) {
						playerByName(argument).client.emit("disconnect", "You were kicked from the server")
						playerByName(argument).client.broadcast.emit("remove player", {id: playerByName(argument).id});
						playerByName(argument).client.disconnect(0);
					} else {
						this.emit("new message", {name: "[SERVER]", message: "You can't kick this player"})
					}
				} else {
					this.emit("new message", {name: "[SERVER]", message: "You don't have permission to execute this command"})
				}
				break;
			case "reset":
				var findPlayer = playerById(sender.id);
				if(findPlayer && findPlayer.role > 3) {
					if(argument == "map") {
						this.broadcast.emit("new message", {name: "[SERVER]", message: "Map will be deleted in 10 seconds!"})
						this.emit("new message", {name: "[SERVER]", message: "Map will be deleted in 10 seconds!"})
						clearTimeout(resetTimer);
						resetTimer = setTimeout(function () {
							for(var a of players) {
								a.client.emit("disconnect", "Server was restarted")
								a.client.disconnect(0);
							}
							if(process.env.DATABASE_URL)
								pg.connect(process.env.DATABASE_URL,function(err,pgClient,done) {
								pgClient.query("TRUNCATE map")
								done();
								})
							init()
						}, 10000);
					} else if (argument == "players") {
						this.broadcast.emit("new message", {name: "[SERVER]", message: "Inventories will be deleted in 10 seconds!"})
						this.emit("new message", {name: "[SERVER]", message: "Inventories will be deleted in 10 seconds!"})
						clearTimeout(resetTimer);
						resetTimer = setTimeout(function () {
							for(var a of players) {
								a.client.emit("disconnect", "Server was restarted");
							}
							if(process.env.DATABASE_URL)
								pg.connect(process.env.DATABASE_URL,function(err,pgClient,done) {
									pgClient.query("TRUNCATE users")
								done();
								})
							init()
						}, 10000);
					} else if(argument == "all") {
						this.broadcast.emit("new message", {name: "[SERVER]", message: "Server will be deleted in 10 seconds!"})
						this.emit("new message", {name: "[SERVER]", message: "Server will be deleted in 10 seconds!"})
						clearTimeout(resetTimer);
						resetTimer = setTimeout(function () {
							for(var a of players) {
								a.client.emit("disconnect", "Server was restarted");
							}
							if(process.env.DATABASE_URL)
								pg.connect(process.env.DATABASE_URL,function(err,pgClient,done) {
									pgClient.query("TRUNCATE map");
									pgClient.query("TRUNCATE users");
								done();
								})
							init()
						}, 10000);
					}else {
						this.emit("new message", {name: "[SERVER]", message: 'Please use "/reset players", "/reset map" or "/reset all"'})
					}
				} else {
					this.emit("new message", {name: "[SERVER]", message: "You don't have permission to execute this command"})
				}
				break;
		}
	} else {
		if(playerById(sender.id).messagesPerMinute < 20) {
			var role="";
			switch(playerById(sender.id).role) {
				case 2:
					role="[VIP] "
					players[players.indexOf(playerById(sender.id))].messagesPerMinute++;
					break;
				case 3:
					role="[MODERATOR] "
					break;
				case 4:
					role="[ADMIN] "
					break;
				default:
					players[players.indexOf(playerById(sender.id))].messagesPerMinute++;
					break;
			}
			this.broadcast.emit("new message", {name: role+playerById(this.id).name, message: validateString(data)})
			this.emit("new message", {name: "You", message: validateString(data)})
		} else if(playerById(sender.id).messagesPerMinute < 25) {
			players[players.indexOf(playerById(sender.id))].messagesPerMinute++;
			this.emit("new message", {name: "[SERVER]", message: "Please stop spamming or you will be muted!"})
		}else if(playerById(sender.id).messagesPerMinute == 25){
			players[players.indexOf(playerById(sender.id))].messagesPerMinute++;
			this.emit("new message", {name: "[SERVER]", message: "You were muted!"})
			this.broadcast.emit("new message", {name: "[SERVER]", message: "Player "+playerById(sender.id).name+" was muted"})
		}
	}
		
}

function onMovePlayer(data) {
	var movePlayer = playerById(this.id);

	if (!movePlayer) {
	    util.log("Player not found: "+this.id);
	    return;
	};

	movePlayer.x = parseInt(data.x);
	movePlayer.y = parseInt(data.y);
	this.broadcast.emit("move player", {id: parseInt(movePlayer.id), x: parseInt(movePlayer.x), y: parseInt(movePlayer.y), texture: parseInt(data.texture)});
}

function onMoveItem(data) {
	if(typeof data.count == "number" && typeof data.start.x == "number" && typeof data.start.y == "number" && typeof data.end.x == "number" && typeof data.end.y == "number") {
		var playerID = players.indexOf(playerById(this.id));
		var item;
		var count = {start:0, end:0};
		util.log(data.start)
		if(data.start.y < 3) {
			if(players[playerID].inventory.inventory[data.start.y][data.start.x].count >= data.count)
				players[playerID].inventory.inventory[data.start.y][data.start.x].count-=data.count;
			item = players[playerID].inventory.inventory[data.start.y][data.start.x].item;
			count.start=players[playerID].inventory.inventory[data.start.y][data.start.x].count;
		} else if(data.start.y == 3) {
			if(players[playerID].inventory.hotbar[data.start.x].count >= data.count)
				players[playerID].inventory.hotbar[data.start.x].count-=data.count;
			item = players[playerID].inventory.hotbar[data.start.x].item;
			count.start=players[playerID].inventory.hotbar[data.start.x].count;
		} else if(data.start.y == 4) {
			if(players[playerID].inventory.armor[data.start.x].count >= data.count)
				players[playerID].inventory.armor[data.start.x].count-=data.count;
			item = players[playerID].inventory.armor[data.start.x].item;
			count.start=players[playerID].inventory.armor[data.start.x].count;
		} else {
			return;
		}
		if(data.end.y < 3) {
			players[playerID].inventory.inventory[data.end.y][data.end.x].item=item;
			players[playerID].inventory.inventory[data.end.y][data.end.x].count+=data.count;
			count.end = players[playerID].inventory.inventory[data.end.y][data.end.x].count;
		} else if(data.end.y == 3) {
			players[playerID].inventory.hotbar[data.end.x].item=item;
			players[playerID].inventory.hotbar[data.end.x].count+=data.count;
			count.end = players[playerID].inventory.hotbar[data.end.x].count;
		} else if(data.end.y == 4) {
			players[playerID].inventory.armor[data.end.x].item=item;
			players[playerID].inventory.armor[data.end.x].count+=data.count;
			count.end = players[playerID].inventory.armor[data.end.x].count;
		} else {
			return;
		}	
		var id=this.id;
		if(process.env.DATABASE_URL) {
			pg.connect(process.env.DATABASE_URL,function(err,pgClient,done) { 
				pgClient.query("UPDATE users SET inventory="+JSON.stringify(players[playerID].inventory)+" WHERE name="+validateString(playerById(id).name), function(err) {
					if(err) {
						util.log("Failed saving player inventory "+err);
					} else {
						util.log("Players "+id+ " inventory was updated");
					}
				})
			done();
			})	
		}	
	}
}

function onMapEdit(data) {
	if(parseInt(data.block) == -1 && map[parseInt(data.x)][parseInt(data.y)] && items[map[parseInt(data.x)][parseInt(data.y)]] && playerById(this.id).inventory.hotbar[parseInt(data.active)]) {
		var dropped = drop(items[map[parseInt(data.x)][parseInt(data.y)]].drop[0], items[map[parseInt(data.x)][parseInt(data.y)]].drop[1], items[map[parseInt(data.x)][parseInt(data.y)]].drop[2], items[map[parseInt(data.x)][parseInt(data.y)]].drop[3], items[map[parseInt(data.x)][parseInt(data.y)]].drop[4], playerById(this.id).inventory.hotbar[parseInt(data.active)].item)
		giveItemToBestInventoryPosition(dropped.item, dropped.count, this.id);
	} else if(playerById(this.id).inventory.hotbar[parseInt(data.active)].item == parseInt(data.block) && playerById(this.id).inventory.hotbar[parseInt(data.active)].count > 0) {
		players[players.indexOf(playerById(this.id))].inventory.hotbar[parseInt(data.active)].count--;
		var item = playerById(this.id).inventory.hotbar[parseInt(data.active)].item;
		if(playerById(this.id).inventory.hotbar[parseInt(data.active)].count == 0) {
			players[players.indexOf(playerById(this.id))].inventory.hotbar[parseInt(data.active)].item = 0;	
			item = 0;
		}
	} else {
		return;
	}
	util.log(playerById(this.id).inventory);
	map[parseInt(data.x)][parseInt(data.y)] = parseInt(data.block);
	this.broadcast.emit("map edit", {x: parseInt(data.x), y: parseInt(data.y), block: parseInt(data.block)})
	this.emit("map edit", {x: parseInt(data.x), y: parseInt(data.y), block: data.block});
	var id=this.id;
	if(process.env.DATABASE_URL) {
		pg.connect(process.env.DATABASE_URL,function(err,pgClient,done) { 
			pgClient.query("UPDATE map SET _"+parseInt(data.y)+"="+parseInt(data.block)+" WHERE y="+parseInt(data.x), function(err) {
				if(err) {
					util.log("Failed map edit "+err)
				} else {
					util.log("Player "+id+ " edited map")
				}
			})
			pgClient.query("UPDATE users SET inventory='"+JSON.stringify(playerById(id).inventory)+"' WHERE name='"+validateString(playerById(id).name)+"'", function(err) {
				if(err) {
					util.log("Failed saving player inventory "+err);
					util.log(validateString(playerById(id).name));
				} else {
					util.log("Players "+id+ " inventory was updated");
				}
			})
		done();
		})	
	}
}

function onBlockBreaking(data) {
	this.broadcast.emit("block breaking", {x: parseInt(data.x), y: parseInt(data.y), progress: parseInt(data.progress), id: this.id})
}

init();

