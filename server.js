var util = require("util"),
	io = require("socket.io"),
	pg = require('pg'), 
	request = require("request"),
	sha256 = require("sha256");

var socket, players;

function validateString(str) {
	return JSON.stringify(str).replace(/\W/g, '')
}


function init() {
	players = [];
	ip = process.env.IP || "0.0.0.0";
	var port = process.env.PORT-1 || 8079;
	port++;//workaround for server port bug


	if(process.env.DATABASE_URL) { // DB 
		pg.connect(process.env.DATABASE_URL,function(err,pgClient,done) {
        if(err){
            util.log("Not able to connect: "+ err);
        } 
        pgClient.query('SELECT * FROM map', function(err,result) {
            if(err){
                util.log(err);
            }
            if(result.rows.length<10) {
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
						util.log("Map was loaded succesfully")
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
	setEventHandlers();
	resetMessagesPerMinutes = setInterval(function() {
		for(var a=0;a<players.length;a++) {
			if(players[a].messagesPerMinute < 25)
				players[a].messagesPerMinute=0;
		}
	},60000);
}

function giveItemToBestInventoryPosition(item, count, id) {
	for(var a of playerById(id).inventory.hotbar) {
		if(a.item == item) {
			a.count += count;	
			return;	
		}
	}
	for (var m of playerById(id).inventory.inventory) {
		for(var a of m) {
			if(a.item == item) {
				a.count += count;	
				return;		
			}
		}				
	}
	for(var a of playerById(id).inventory.hotbar) {
		if(a.item == undefined) {
			a.count = count;
			a.item = item;	
			return;
		}
	}
	for (var m of playerById(id).inventory.inventory) {
		for(var a of m) {
			if(a.item == undefined) {
				a.count = count;
				a.item = item;	
				return;		
			}
		}				
	}
}

function drop(item1, count1, condition, item2, count2, activeItem) {
	this.item1 = item1;
	this.count1 = count1 || 1;
	this.condition = condition || undefined;
	this.item2 = item2 || undefined;
	this.count2 = count2 || 1;
	this.drop = function() {
		if(activeItem != undefined && this.condition != undefined && items[activeItem].type == this.condition && this.item2 != undefined) {
			return {item: this.item2, count: this.count2};
		} else if(item1 != undefined){
			return {item: this.item1, count: this.count1};
		} else {
			return {item: undefined, count: 0};
		}
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

var items = [
	{name: "stone", durability: 500, stack: 64, x:13, favType:"pickaxe"},                            					    
	{name: "cobblestone", durability: 500, stack: 64, x:7, favType:"pickaxe"},											
	{name: "wood", durability: 300, stack: 64, x:11, favType: "axe", smelting: 1000},									
	{name: "leaves", durability: 50, stack: 64, x:12, favType:"scissors", smelting: 300},								
	{name: "grass", durability: 100, stack: 64, x:10, favType:"scissors", favType2: "shovel"},							
	{name: "dirt", durability: 100, stack: 64, x:9, favType:"shovel"},											
	{name: "bedrock", durability: Infinity},																		
	{name: "iron ore", durability: 700, stack: 64, x:3, favType:"pickaxe"},													
	{name: "coal ore", durability: 600, stack: 64, x:0, favType:"pickaxe"},		 										
	{name: "diamond ore", durability: 1000, stack: 64, x:1, favType:"pickaxe"},  										
	{name: "gold ore", durability: 800, stack: 64, x:2, favType:"pickaxe"},			 										
	{name: "wooden planks", durability: 200, stack: 64, x:5, favType: "axe", smelting: 500},								
	{name: "crafting table", durability: 200, stack: 64, x:8, favType: "axe", active:"crafting", smelting: 1000},			
	{name: "furnace", durability: 500, stack: 64, x:4, favType: "pickaxe", active:"furnace"},								
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

items[0].drop=[undefined, 0, "pickaxe", 1];
items[1].drop=[undefined, 0, "pickaxe", 1];
items[2].drop=[2];
items[3].drop=[undefined, 0, "scissors", 3];
items[4].drop=[5, 1, "scissors", 4];
items[5].drop=[5];
items[6].drop=[undefined];
items[7].drop=[undefined, 0, "pickaxe", 7];
items[8].drop=[undefined, 0, "pickaxe", 51];
items[9].drop=[undefined, 0, "pickaxe", 50];
items[10].drop=[undefined, 0, "pickaxe", 10];
items[11].drop=[11];
items[12].drop=[12];
items[13].drop=[undefined, 0, "pickaxe", 13];


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

function Player(gtX, gtY, gtID, gtName, gtInv) {
	this.id = gtID,
	this.name = gtName,
	this.x = gtX,
	this.y = gtY;
	this.inventory = gtInv;
	this.messagesPerMinute=0;

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

var setEventHandlers = function() {
    socket.sockets.on("connection", onSocketConnection);
};
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

	players.splice(players.indexOf(removePlayer), 1);
	this.broadcast.emit("remove player", {id: this.id});
};

function onNewPlayer(data) {
	var newInv;
	var client=this;
	util.log("Player "+data.name+" send authorization token")
	request.post({url:'http://mc2d.herokuapp.com/index.php', form: {name: data.name, token: data.token, salt: this.salt}}, function(err,httpResponse,body){
		if(err) {
			util.log("Login server offline")
		}
		if(body == "true") {
			pg.connect(process.env.DATABASE_URL,function(err,pgClient,done) {
       	 		if(err){
            		util.log("Not able to connect: "+ err);
            		return;
        		} 
        		pgClient.query('SELECT * FROM '+validateString(data.name), function(err,result) {
        			if(err) {
	            		util.log("Player "+data.name+" is new here!");
	            		pgClient.query('CREATE TABLE '+validateString(data.name)+'(x smallint, y smallint, amount smallint, id smallint)', function(err) {
	            			if(err) {
	            				util.log("Failed creating player profile");
	            				return;
	            			} else {
	            				for(var a=0;a<4;a++) {
	            					for(var b=0;b<9;b++) {
	            						pgClient.query('INSERT INTO '+validateString(data.name)+'(x, y, amount, id) VALUES ('+b+', '+a+', 0, -1)');
	            					} 
	            				}
								pgClient.query('INSERT INTO '+validateString(data.name)+'(x, y, amount, id) VALUES (0, 4, 0, -1), (1, 4, 0, -1), (2, 4, 0, -1), (3, 4, 0, -1)');
								newInv=inventoryPreset;
	            			}
	            		})
        			} else if(result) {
        				client.emit("inventory", result.rows);
        				newInv=inventoryPreset;
        				for(var a of result.rows) {
							if(data.amount) {
								var item=a.id;
							}
							if(a.y < 3) {
								newInv.inventory[a.y][a.x].item=item;
								newInv.inventory[a.y][a.x].count=data.amount;
							} else if(a.y == 3) {
								newInv.hotbar[a.x].item=item;
								newInv.hotbar[a.x].count=data.amount;
							} else if(a.y == 4) {
								newInv.armor[a.x].item=item;
								newInv.armor[a.x].count=data.amount;
							}
						}
        			}
        		})
        	})
			client.emit("new map", map)
		    client.on("disconnect", onClientDisconnect);
		    client.on("move player", onMovePlayer);
		    client.on("map edit", onMapEdit);
		    client.on("new message", onNewMessage);
		    client.on("block breaking", onBlockBreaking);
			util.log("Player "+data.name+" authorized succesfully")
			var newPlayer = new Player(data.x, data.y, client.id, data.name, newInv);
			client.broadcast.emit("new player", {id: newPlayer.id, x: newPlayer.x, y: newPlayer.y, name: newPlayer.name});
			var existingPlayer;
			for (var i = 0; i < players.length; i++) {
		    	existingPlayer = players[i];
		    	client.emit("new player", {id: existingPlayer.id, x: existingPlayer.x, y: existingPlayer.y, name: existingPlayer.name});
			};
			players.push(newPlayer);
		} else {
			util.log("Player "+data.name+" authorization failed")
		}
    })
};

function onNewMessage(data) {
	var sender = playerById(this.id);
	if(data[0] == "/") {
		var data = data.split("/")[data.split("/").length]
		var command = data.split(" ")[0]
		var argument = data.split(" ")[1]
		switch(command) {
			case "ban":
				if(sender.role > 3) {
					if(playerByName(argument)) {
						if(sender.role > playerByName(argument).role) {
							this.emit("new message", {name: "[SERVER]", message: "Player "+argument+" was banned by "+playerById(this.id).name})
						} else {
							this.emit("new message", {name: "[SERVER]", message: "You can't ban this player"})
						}
					} else {
						this.emit("new message", {name: "[SERVER]", message: "This player doesn't exist, make sure the name is written properly"})
					}
				} else {
					this.emit("new message", {name: "[SERVER]", message: "You dont have permission to use this command"})
				}
				break;
		}
	} else {
		if(sender.messagesPerMinute < 20) {
			players.indexOf(sender).messagesPerMinute++;
			this.broadcast.emit("new message", {name: playerById(this.id).name, message: data})
			this.emit("new message", {name: "You", message: data})
		} else if(sender.messagesPerMinute < 25) {
			players.indexOf(sender).messagesPerMinute++;
			this.emit("new message", {name: "[SERVER]", message: "You were muted!"})
		}else {
			this.emit("new message", {name: "[SERVER]", message: "Please stop spamming or you will be muted!"})
		}		
	}
		
}

function onMovePlayer(data) {
	var movePlayer = playerById(this.id);

	if (!movePlayer) {
	    util.log("Player not found: "+this.id);
	    return;
	};

	movePlayer.x = data.x;
	movePlayer.y = data.y;
	this.broadcast.emit("move player", {id: movePlayer.id, x: movePlayer.x, y: movePlayer.y, texture: data.texture});
}


function onMapEdit(data) {
	if(data.block == -1) {
		var dropped = drop(items[map[data.x][data.y]].drop[0], items[map[data.x][data.y]].drop[1], items[map[data.x][data.y]].drop[2], items[map[data.x][data.y]].drop[3], items[map[data.x][data.y]].drop[4], playerById(this.id).inventory.hotbar[data.active].item)
		giveItemToBestInventoryPosition(dropped.item, dropped.count, this.id);
	} else if(materials.indexOf(playerById(this.id).inventory.hotbar[data.active]) == data.block && playerById(this.id).inventory.hotbar[data.active].count > 0) {
		players[playerById(this.id)].inventory.hotbar[data.active].count--;
		if(playerById(this.id).inventory.hotbar[data.active].count == 0)
			players[playerById(this.id)].inventory.hotbar[data.active].item = undefined;	
	} else 
		return;
	map[data.x][data.y] = data.block;
	this.broadcast.emit("map edit", {x: data.x, y: data.y, block: data.block})
	this.emit("map edit", {x: data.x, y: data.y, block: data.block});
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
		})	
	}
}

function onBlockBreaking(data) {
	this.broadcast.emit("block breaking", {x: data.x, y: data.y, progress: data.progress, id: this.id})
}

init();